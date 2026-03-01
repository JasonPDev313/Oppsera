import { eq, and, gte, lte, not, inArray, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  spaServices,
  spaProviders,
  spaProviderAvailability,
  spaProviderTimeOff,
  spaProviderServiceEligibility,
  spaAppointments,
  spaAppointmentItems,
  spaResources,
  spaServiceResourceRequirements,
} from '@oppsera/db';

// ── Types ────────────────────────────────────────────────────────────

export interface AvailableSlot {
  providerId: string;
  providerName: string;
  startTime: Date;
  endTime: Date;
  resourceId?: string;
  resourceName?: string;
}

export interface ConflictDetail {
  type:
    | 'provider_busy'
    | 'resource_busy'
    | 'provider_time_off'
    | 'outside_availability'
    | 'customer_overlap';
  description: string;
  conflictingAppointmentId?: string;
}

export interface ProviderDaySchedule {
  providerId: string;
  date: string;
  availabilityWindows: { start: string; end: string }[];
  appointments: {
    id: string;
    startTime: string;
    endTime: string;
    serviceName: string;
    customerName: string;
    status: string;
  }[];
  timeOffBlocks: { start: string; end: string; reason: string }[];
}

export interface GetAvailableSlotsParams {
  tenantId: string;
  serviceId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  providerId?: string;
  locationId?: string;
  slotIntervalMinutes?: number;
}

export interface CheckSlotAvailabilityParams {
  tenantId: string;
  providerId: string;
  startTime: Date;
  endTime: Date;
  serviceId: string;
  locationId?: string;
  excludeAppointmentId?: string;
}

export interface CheckSlotAvailabilityResult {
  available: boolean;
  conflicts: ConflictDetail[];
}

export interface GetProviderDayScheduleParams {
  tenantId: string;
  providerId: string;
  date: string; // YYYY-MM-DD
  locationId?: string;
}

// ── Internal helper types ────────────────────────────────────────────

/** A continuous block of time [start, end) */
export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface ProviderInfo {
  id: string;
  displayName: string;
}

export interface ServiceInfo {
  id: string;
  durationMinutes: number;
  bufferMinutes: number;
  setupMinutes: number;
  cleanupMinutes: number;
}

export interface ResourceRequirement {
  resourceId: string | null;
  resourceType: string | null;
  quantity: number;
  isMandatory: boolean;
}

export interface ResourceInfo {
  id: string;
  name: string;
  resourceType: string;
  locationId: string | null;
  isActive: boolean;
}

// Appointment statuses that block a time slot
export const BLOCKING_STATUSES = [
  'draft',
  'reserved',
  'confirmed',
  'checked_in',
  'in_service',
  'completed',
  'checked_out',
];

// ── Pure helpers (no DB access) ──────────────────────────────────────

/**
 * Parse a "HH:MM" time string into total minutes since midnight.
 */
export function timeToMinutes(t: string): number {
  const parts = t.split(':');
  const [h = 0, m = 0] = parts.map(Number);
  return h * 60 + m;
}

/**
 * Create a Date representing a specific date + time-of-day in minutes.
 */
export function dateWithMinutes(dateStr: string, minutes: number): Date {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMinutes(minutes);
  return d;
}

/**
 * Format a Date as "YYYY-MM-DD".
 */
export function formatDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Get the start of a day (midnight UTC) for a YYYY-MM-DD string.
 */
export function dayStartUtc(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00Z');
}

/**
 * Get the end of a day (23:59:59.999 UTC) for a YYYY-MM-DD string.
 */
export function dayEndUtc(dateStr: string): Date {
  return new Date(dateStr + 'T23:59:59.999Z');
}

/**
 * Enumerate each date string (YYYY-MM-DD) between startDate and endDate inclusive.
 */
export function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (current <= end) {
    dates.push(formatDateStr(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Subtract a set of blocked windows from a set of available windows.
 * Returns the remaining available windows.
 *
 * All windows are treated as [start, end).
 */
export function subtractWindows(
  available: TimeWindow[],
  blocked: TimeWindow[],
): TimeWindow[] {
  let result = [...available];
  for (const block of blocked) {
    const next: TimeWindow[] = [];
    for (const window of result) {
      // No overlap — block is entirely before or after the window
      if (block.end <= window.start || block.start >= window.end) {
        next.push(window);
        continue;
      }
      // Block overlaps: split window into before-block and after-block portions
      if (block.start > window.start) {
        next.push({ start: window.start, end: block.start });
      }
      if (block.end < window.end) {
        next.push({ start: block.end, end: window.end });
      }
    }
    result = next;
  }
  return result;
}

/**
 * Generate time slots of a given duration at a given interval within available windows.
 */
export function generateSlots(
  windows: TimeWindow[],
  totalDurationMinutes: number,
  intervalMinutes: number,
): TimeWindow[] {
  const slots: TimeWindow[] = [];
  const durationMs = totalDurationMinutes * 60_000;
  const intervalMs = intervalMinutes * 60_000;

  for (const window of windows) {
    let cursor = window.start.getTime();
    const windowEnd = window.end.getTime();

    while (cursor + durationMs <= windowEnd) {
      slots.push({
        start: new Date(cursor),
        end: new Date(cursor + durationMs),
      });
      cursor += intervalMs;
    }
  }

  return slots;
}

// ── Main functions ───────────────────────────────────────────────────

/**
 * Get available appointment time slots for a service within a date range.
 *
 * For each eligible provider on each date, this:
 * 1. Resolves the provider's availability template for that day-of-week
 * 2. Subtracts approved time-off periods
 * 3. Subtracts existing appointments (including buffer time)
 * 4. If the service requires resources, further filters by resource availability
 * 5. Generates slots at the configured interval
 */
export async function getAvailableSlots(
  params: GetAvailableSlotsParams,
): Promise<AvailableSlot[]> {
  const {
    tenantId,
    serviceId,
    startDate,
    endDate,
    providerId,
    locationId,
    slotIntervalMinutes = 15,
  } = params;

  return withTenant(tenantId, async (tx) => {
    // ── 1. Fetch the service ───────────────────────────────────────
    const [service] = await tx
      .select({
        id: spaServices.id,
        durationMinutes: spaServices.durationMinutes,
        bufferMinutes: spaServices.bufferMinutes,
        setupMinutes: spaServices.setupMinutes,
        cleanupMinutes: spaServices.cleanupMinutes,
      })
      .from(spaServices)
      .where(
        and(
          eq(spaServices.id, serviceId),
          eq(spaServices.tenantId, tenantId),
          eq(spaServices.isActive, true),
        ),
      )
      .limit(1);

    if (!service) {
      return [];
    }

    // Total time the appointment blocks (prep + service + cleanup)
    const totalDuration =
      service.setupMinutes + service.durationMinutes + service.cleanupMinutes;

    // ── 2. Fetch eligible providers ────────────────────────────────
    const eligibilityConditions = [
      eq(spaProviderServiceEligibility.tenantId, tenantId),
      eq(spaProviderServiceEligibility.serviceId, serviceId),
    ];
    if (providerId) {
      eligibilityConditions.push(
        eq(spaProviderServiceEligibility.providerId, providerId),
      );
    }

    const eligibilities = await tx
      .select({
        providerId: spaProviderServiceEligibility.providerId,
        customDurationMinutes: spaProviderServiceEligibility.customDurationMinutes,
      })
      .from(spaProviderServiceEligibility)
      .where(and(...eligibilityConditions));

    if (eligibilities.length === 0) {
      return [];
    }

    const providerIds = eligibilities.map((e) => e.providerId);

    // Build a map of provider-specific durations (custom or service default)
    const providerDurationMap = new Map<string, number>();
    for (const elig of eligibilities) {
      const effectiveDuration = elig.customDurationMinutes ?? service.durationMinutes;
      providerDurationMap.set(
        elig.providerId,
        service.setupMinutes + effectiveDuration + service.cleanupMinutes,
      );
    }

    // Fetch provider details (active only)
    const providers = await tx
      .select({
        id: spaProviders.id,
        displayName: spaProviders.displayName,
      })
      .from(spaProviders)
      .where(
        and(
          inArray(spaProviders.id, providerIds),
          eq(spaProviders.tenantId, tenantId),
          eq(spaProviders.isActive, true),
        ),
      );

    if (providers.length === 0) {
      return [];
    }

    const activeProviderIds = providers.map((p) => p.id);
    const providerMap = new Map<string, ProviderInfo>();
    for (const p of providers) {
      providerMap.set(p.id, p);
    }

    // ── 3. Fetch availability templates for these providers ────────
    const rangeStart = startDate;
    const rangeEnd = endDate;

    const availabilityRows = await tx
      .select({
        providerId: spaProviderAvailability.providerId,
        dayOfWeek: spaProviderAvailability.dayOfWeek,
        startTime: spaProviderAvailability.startTime,
        endTime: spaProviderAvailability.endTime,
        locationId: spaProviderAvailability.locationId,
        effectiveFrom: spaProviderAvailability.effectiveFrom,
        effectiveUntil: spaProviderAvailability.effectiveUntil,
      })
      .from(spaProviderAvailability)
      .where(
        and(
          eq(spaProviderAvailability.tenantId, tenantId),
          inArray(spaProviderAvailability.providerId, activeProviderIds),
          eq(spaProviderAvailability.isActive, true),
          lte(spaProviderAvailability.effectiveFrom, rangeEnd),
          // effectiveUntil is nullable — NULL means open-ended
          sql`(${spaProviderAvailability.effectiveUntil} IS NULL OR ${spaProviderAvailability.effectiveUntil} >= ${rangeStart})`,
        ),
      );

    // ── 4. Fetch time-off for these providers in the date range ────
    const rangeStartDate = dayStartUtc(startDate);
    const rangeEndDate = dayEndUtc(endDate);

    const timeOffRows = await tx
      .select({
        providerId: spaProviderTimeOff.providerId,
        startAt: spaProviderTimeOff.startAt,
        endAt: spaProviderTimeOff.endAt,
        isAllDay: spaProviderTimeOff.isAllDay,
      })
      .from(spaProviderTimeOff)
      .where(
        and(
          eq(spaProviderTimeOff.tenantId, tenantId),
          inArray(spaProviderTimeOff.providerId, activeProviderIds),
          // Only approved time-off blocks availability
          eq(spaProviderTimeOff.status, 'approved'),
          // Overlaps with our range
          lte(spaProviderTimeOff.startAt, rangeEndDate),
          gte(spaProviderTimeOff.endAt, rangeStartDate),
        ),
      );

    // ── 5. Fetch existing appointments for these providers ─────────
    const existingAppointments = await tx
      .select({
        id: spaAppointments.id,
        providerId: spaAppointments.providerId,
        resourceId: spaAppointments.resourceId,
        startAt: spaAppointments.startAt,
        endAt: spaAppointments.endAt,
        status: spaAppointments.status,
      })
      .from(spaAppointments)
      .where(
        and(
          eq(spaAppointments.tenantId, tenantId),
          inArray(spaAppointments.providerId, activeProviderIds),
          not(inArray(spaAppointments.status, ['canceled', 'no_show'])),
          lte(spaAppointments.startAt, rangeEndDate),
          gte(spaAppointments.endAt, rangeStartDate),
        ),
      );

    // ── 6. Fetch resource requirements if any ──────────────────────
    const resourceRequirements = await tx
      .select({
        resourceId: spaServiceResourceRequirements.resourceId,
        resourceType: spaServiceResourceRequirements.resourceType,
        quantity: spaServiceResourceRequirements.quantity,
        isMandatory: spaServiceResourceRequirements.isMandatory,
      })
      .from(spaServiceResourceRequirements)
      .where(
        and(
          eq(spaServiceResourceRequirements.tenantId, tenantId),
          eq(spaServiceResourceRequirements.serviceId, serviceId),
        ),
      );

    // Fetch candidate resources if service has resource requirements
    let candidateResources: ResourceInfo[] = [];
    if (resourceRequirements.length > 0) {
      const resourceConditions = [
        eq(spaResources.tenantId, tenantId),
        eq(spaResources.isActive, true),
      ];
      if (locationId) {
        // Resources at the requested location or without a location (shared)
        resourceConditions.push(
          sql`(${spaResources.locationId} = ${locationId} OR ${spaResources.locationId} IS NULL)`,
        );
      }
      candidateResources = await tx
        .select({
          id: spaResources.id,
          name: spaResources.name,
          resourceType: spaResources.resourceType,
          locationId: spaResources.locationId,
          isActive: spaResources.isActive,
        })
        .from(spaResources)
        .where(and(...resourceConditions));
    }

    // Index existing appointments by resource for resource conflict checks
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    for (const appt of existingAppointments) {
      if (appt.resourceId) {
        const existing = appointmentsByResource.get(appt.resourceId) ?? [];
        existing.push({
          start: new Date(appt.startAt),
          end: new Date(appt.endAt),
        });
        appointmentsByResource.set(appt.resourceId, existing);
      }
    }

    // ── 7. Generate slots per provider per date ────────────────────
    const dates = enumerateDates(startDate, endDate);
    const result: AvailableSlot[] = [];

    for (const pid of activeProviderIds) {
      const provider = providerMap.get(pid);
      if (!provider) continue;

      const effectiveTotalDuration = providerDurationMap.get(pid) ?? totalDuration;
      const bufferMs = service.bufferMinutes * 60_000;

      // Collect this provider's time-off blocks
      const providerTimeOff = timeOffRows.filter((t) => t.providerId === pid);

      // Collect this provider's existing appointments
      const providerAppts = existingAppointments.filter(
        (a) => a.providerId === pid,
      );

      for (const dateStr of dates) {
        const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay();

        // a. Build availability windows from templates for this day-of-week
        const matchingTemplates = availabilityRows.filter((r) => {
          if (r.providerId !== pid) return false;
          if (r.dayOfWeek !== dayOfWeek) return false;
          // Check effective date range
          if (r.effectiveFrom > dateStr) return false;
          if (r.effectiveUntil != null && r.effectiveUntil < dateStr) return false;
          // Check location filter
          if (locationId && r.locationId && r.locationId !== locationId) return false;
          return true;
        });

        if (matchingTemplates.length === 0) continue;

        let windows: TimeWindow[] = matchingTemplates.map((t) => ({
          start: dateWithMinutes(dateStr, timeToMinutes(t.startTime)),
          end: dateWithMinutes(dateStr, timeToMinutes(t.endTime)),
        }));

        // b. Subtract time-off blocks
        const timeOffBlocks: TimeWindow[] = [];
        for (const toff of providerTimeOff) {
          const tStart = new Date(toff.startAt);
          const tEnd = new Date(toff.endAt);
          if (toff.isAllDay) {
            // Block the entire day
            timeOffBlocks.push({
              start: dayStartUtc(dateStr),
              end: dayEndUtc(dateStr),
            });
          } else if (tStart < dayEndUtc(dateStr) && tEnd > dayStartUtc(dateStr)) {
            timeOffBlocks.push({ start: tStart, end: tEnd });
          }
        }
        if (timeOffBlocks.length > 0) {
          windows = subtractWindows(windows, timeOffBlocks);
        }

        // c. Subtract existing appointments (including buffer before and after)
        const apptBlocks: TimeWindow[] = providerAppts
          .filter((a) => {
            const aStart = new Date(a.startAt);
            const aEnd = new Date(a.endAt);
            return (
              aStart < dayEndUtc(dateStr) && aEnd > dayStartUtc(dateStr)
            );
          })
          .map((a) => ({
            start: new Date(new Date(a.startAt).getTime() - bufferMs),
            end: new Date(new Date(a.endAt).getTime() + bufferMs),
          }));

        if (apptBlocks.length > 0) {
          windows = subtractWindows(windows, apptBlocks);
        }

        // d. Generate candidate slots within remaining windows
        const candidateSlots = generateSlots(
          windows,
          effectiveTotalDuration,
          slotIntervalMinutes,
        );

        // e. If service needs resources, pair each slot with an available resource
        if (resourceRequirements.length > 0) {
          for (const slot of candidateSlots) {
            const resourceMatch = findAvailableResource(
              resourceRequirements,
              candidateResources,
              appointmentsByResource,
              slot,
            );
            if (resourceMatch) {
              result.push({
                providerId: pid,
                providerName: provider.displayName,
                startTime: slot.start,
                endTime: slot.end,
                resourceId: resourceMatch.id,
                resourceName: resourceMatch.name,
              });
            }
          }
        } else {
          // No resource requirements — all candidate slots are available
          for (const slot of candidateSlots) {
            result.push({
              providerId: pid,
              providerName: provider.displayName,
              startTime: slot.start,
              endTime: slot.end,
            });
          }
        }
      }
    }

    // Sort by start time, then provider name
    result.sort((a, b) => {
      const timeDiff = a.startTime.getTime() - b.startTime.getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.providerName.localeCompare(b.providerName);
    });

    return result;
  });
}

/**
 * Check if a specific time slot is available for a provider + service.
 * Returns detailed conflict information when unavailable.
 */
export async function checkSlotAvailability(
  params: CheckSlotAvailabilityParams,
): Promise<CheckSlotAvailabilityResult> {
  const {
    tenantId,
    providerId,
    startTime,
    endTime,
    serviceId,
    locationId,
    excludeAppointmentId,
  } = params;

  return withTenant(tenantId, async (tx) => {
    const conflicts: ConflictDetail[] = [];

    // ── 1. Check provider availability template ────────────────────
    const dateStr = formatDateStr(startTime);
    const dayOfWeek = startTime.getUTCDay();

    const availTemplates = await tx
      .select({
        startTime: spaProviderAvailability.startTime,
        endTime: spaProviderAvailability.endTime,
        locationId: spaProviderAvailability.locationId,
      })
      .from(spaProviderAvailability)
      .where(
        and(
          eq(spaProviderAvailability.tenantId, tenantId),
          eq(spaProviderAvailability.providerId, providerId),
          eq(spaProviderAvailability.dayOfWeek, dayOfWeek),
          eq(spaProviderAvailability.isActive, true),
          lte(spaProviderAvailability.effectiveFrom, dateStr),
          sql`(${spaProviderAvailability.effectiveUntil} IS NULL OR ${spaProviderAvailability.effectiveUntil} >= ${dateStr})`,
        ),
      );

    // Filter by location if applicable
    const filteredTemplates = availTemplates.filter((t) => {
      if (locationId && t.locationId && t.locationId !== locationId) return false;
      return true;
    });

    // Check that the requested time falls within at least one availability window
    const slotStartMinutes =
      startTime.getUTCHours() * 60 + startTime.getUTCMinutes();
    const slotEndMinutes = endTime.getUTCHours() * 60 + endTime.getUTCMinutes();

    const withinAvailability = filteredTemplates.some((t) => {
      const templateStart = timeToMinutes(t.startTime);
      const templateEnd = timeToMinutes(t.endTime);
      return slotStartMinutes >= templateStart && slotEndMinutes <= templateEnd;
    });

    if (!withinAvailability) {
      conflicts.push({
        type: 'outside_availability',
        description: `Provider is not available on ${dateStr} at the requested time`,
      });
    }

    // ── 2. Check time-off ──────────────────────────────────────────
    const timeOffRows = await tx
      .select({
        id: spaProviderTimeOff.id,
        startAt: spaProviderTimeOff.startAt,
        endAt: spaProviderTimeOff.endAt,
        isAllDay: spaProviderTimeOff.isAllDay,
        reason: spaProviderTimeOff.reason,
      })
      .from(spaProviderTimeOff)
      .where(
        and(
          eq(spaProviderTimeOff.tenantId, tenantId),
          eq(spaProviderTimeOff.providerId, providerId),
          eq(spaProviderTimeOff.status, 'approved'),
          lte(spaProviderTimeOff.startAt, endTime),
          gte(spaProviderTimeOff.endAt, startTime),
        ),
      );

    for (const toff of timeOffRows) {
      const isBlocked =
        toff.isAllDay ||
        (new Date(toff.startAt) < endTime && new Date(toff.endAt) > startTime);
      if (isBlocked) {
        conflicts.push({
          type: 'provider_time_off',
          description: `Provider has approved time off${toff.reason ? `: ${toff.reason}` : ''}`,
        });
      }
    }

    // ── 3. Check existing appointments (provider busy) ─────────────
    // Fetch service buffer time for expanded conflict window
    const [service] = await tx
      .select({
        bufferMinutes: spaServices.bufferMinutes,
      })
      .from(spaServices)
      .where(
        and(
          eq(spaServices.id, serviceId),
          eq(spaServices.tenantId, tenantId),
        ),
      )
      .limit(1);

    const bufferMs = (service?.bufferMinutes ?? 0) * 60_000;
    const expandedStart = new Date(startTime.getTime() - bufferMs);
    const expandedEnd = new Date(endTime.getTime() + bufferMs);

    const apptConditions = [
      eq(spaAppointments.tenantId, tenantId),
      eq(spaAppointments.providerId, providerId),
      not(inArray(spaAppointments.status, ['canceled', 'no_show'])),
      sql`${spaAppointments.startAt} < ${expandedEnd}`,
      sql`${spaAppointments.endAt} > ${expandedStart}`,
    ];

    if (excludeAppointmentId) {
      apptConditions.push(
        sql`${spaAppointments.id} != ${excludeAppointmentId}`,
      );
    }

    const conflictingAppts = await tx
      .select({
        id: spaAppointments.id,
        startAt: spaAppointments.startAt,
        endAt: spaAppointments.endAt,
        status: spaAppointments.status,
      })
      .from(spaAppointments)
      .where(and(...apptConditions));

    for (const appt of conflictingAppts) {
      conflicts.push({
        type: 'provider_busy',
        description: `Provider has an existing appointment from ${new Date(appt.startAt).toISOString()} to ${new Date(appt.endAt).toISOString()} (status: ${appt.status})`,
        conflictingAppointmentId: appt.id,
      });
    }

    // ── 4. Check resource availability ─────────────────────────────
    const resourceRequirements = await tx
      .select({
        resourceId: spaServiceResourceRequirements.resourceId,
        resourceType: spaServiceResourceRequirements.resourceType,
        quantity: spaServiceResourceRequirements.quantity,
        isMandatory: spaServiceResourceRequirements.isMandatory,
      })
      .from(spaServiceResourceRequirements)
      .where(
        and(
          eq(spaServiceResourceRequirements.tenantId, tenantId),
          eq(spaServiceResourceRequirements.serviceId, serviceId),
        ),
      );

    for (const req of resourceRequirements) {
      if (!req.isMandatory) continue;

      // Find candidate resources matching this requirement
      const resourceConditions = [
        eq(spaResources.tenantId, tenantId),
        eq(spaResources.isActive, true),
      ];
      if (req.resourceId) {
        resourceConditions.push(eq(spaResources.id, req.resourceId));
      } else if (req.resourceType) {
        resourceConditions.push(eq(spaResources.resourceType, req.resourceType));
      }
      if (locationId) {
        resourceConditions.push(
          sql`(${spaResources.locationId} = ${locationId} OR ${spaResources.locationId} IS NULL)`,
        );
      }

      const resources = await tx
        .select({ id: spaResources.id, name: spaResources.name })
        .from(spaResources)
        .where(and(...resourceConditions));

      if (resources.length === 0) {
        conflicts.push({
          type: 'resource_busy',
          description: `No active resource found for requirement (${req.resourceId ? `resource ${req.resourceId}` : `type ${req.resourceType}`})`,
        });
        continue;
      }

      // Check if at least one candidate resource is free during the slot
      const resourceIds = resources.map((r) => r.id);
      const busyResourceAppts = await tx
        .select({
          resourceId: spaAppointments.resourceId,
        })
        .from(spaAppointments)
        .where(
          and(
            eq(spaAppointments.tenantId, tenantId),
            inArray(spaAppointments.resourceId, resourceIds),
            not(inArray(spaAppointments.status, ['canceled', 'no_show'])),
            sql`${spaAppointments.startAt} < ${endTime}`,
            sql`${spaAppointments.endAt} > ${startTime}`,
            excludeAppointmentId
              ? sql`${spaAppointments.id} != ${excludeAppointmentId}`
              : sql`TRUE`,
          ),
        );

      // Also check appointment items for resource conflicts
      const busyResourceItems = await tx
        .select({
          resourceId: spaAppointmentItems.resourceId,
        })
        .from(spaAppointmentItems)
        .where(
          and(
            eq(spaAppointmentItems.tenantId, tenantId),
            inArray(spaAppointmentItems.resourceId, resourceIds),
            not(inArray(spaAppointmentItems.status, ['canceled'])),
            sql`${spaAppointmentItems.startAt} < ${endTime}`,
            sql`${spaAppointmentItems.endAt} > ${startTime}`,
          ),
        );

      const busyResourceIds = new Set<string>();
      for (const a of busyResourceAppts) {
        if (a.resourceId) busyResourceIds.add(a.resourceId);
      }
      for (const i of busyResourceItems) {
        if (i.resourceId) busyResourceIds.add(i.resourceId);
      }

      const availableCount = resources.filter(
        (r) => !busyResourceIds.has(r.id),
      ).length;

      if (availableCount < req.quantity) {
        conflicts.push({
          type: 'resource_busy',
          description: `Not enough ${req.resourceType ?? 'required'} resources available (need ${req.quantity}, have ${availableCount} free)`,
        });
      }
    }

    return {
      available: conflicts.length === 0,
      conflicts,
    };
  });
}

/**
 * Get a provider's full day schedule: availability windows, booked appointments, and time-off.
 */
export async function getProviderDaySchedule(
  params: GetProviderDayScheduleParams,
): Promise<ProviderDaySchedule> {
  const { tenantId, providerId, date, locationId } = params;

  return withTenant(tenantId, async (tx) => {
    const dayOfWeek = new Date(date + 'T12:00:00Z').getUTCDay();
    const dayStart = dayStartUtc(date);
    const dayEnd = dayEndUtc(date);

    // ── 1. Availability windows ────────────────────────────────────
    const availRows = await tx
      .select({
        startTime: spaProviderAvailability.startTime,
        endTime: spaProviderAvailability.endTime,
        locationId: spaProviderAvailability.locationId,
      })
      .from(spaProviderAvailability)
      .where(
        and(
          eq(spaProviderAvailability.tenantId, tenantId),
          eq(spaProviderAvailability.providerId, providerId),
          eq(spaProviderAvailability.dayOfWeek, dayOfWeek),
          eq(spaProviderAvailability.isActive, true),
          lte(spaProviderAvailability.effectiveFrom, date),
          sql`(${spaProviderAvailability.effectiveUntil} IS NULL OR ${spaProviderAvailability.effectiveUntil} >= ${date})`,
        ),
      );

    const availabilityWindows = availRows
      .filter((r) => {
        if (locationId && r.locationId && r.locationId !== locationId)
          return false;
        return true;
      })
      .map((r) => ({
        start: r.startTime,
        end: r.endTime,
      }));

    // ── 2. Booked appointments ─────────────────────────────────────
    const apptRows = await tx
      .select({
        id: spaAppointments.id,
        startAt: spaAppointments.startAt,
        endAt: spaAppointments.endAt,
        status: spaAppointments.status,
        guestName: spaAppointments.guestName,
        customerId: spaAppointments.customerId,
      })
      .from(spaAppointments)
      .where(
        and(
          eq(spaAppointments.tenantId, tenantId),
          eq(spaAppointments.providerId, providerId),
          not(inArray(spaAppointments.status, ['canceled', 'no_show'])),
          lte(spaAppointments.startAt, dayEnd),
          gte(spaAppointments.endAt, dayStart),
        ),
      );

    // Fetch service names for each appointment via appointment items
    const apptIds = apptRows.map((a) => a.id);
    const itemServiceMap = new Map<string, string>();

    if (apptIds.length > 0) {
      const items = await tx
        .select({
          appointmentId: spaAppointmentItems.appointmentId,
          serviceId: spaAppointmentItems.serviceId,
        })
        .from(spaAppointmentItems)
        .where(
          and(
            eq(spaAppointmentItems.tenantId, tenantId),
            inArray(spaAppointmentItems.appointmentId, apptIds),
          ),
        );

      // Fetch service names
      const serviceIds = [...new Set(items.map((i) => i.serviceId))];
      if (serviceIds.length > 0) {
        const services = await tx
          .select({ id: spaServices.id, name: spaServices.name })
          .from(spaServices)
          .where(inArray(spaServices.id, serviceIds));

        const serviceNameMap = new Map(services.map((s) => [s.id, s.name]));

        // Map appointment ID to the first service name (primary service)
        for (const item of items) {
          if (!itemServiceMap.has(item.appointmentId)) {
            itemServiceMap.set(
              item.appointmentId,
              serviceNameMap.get(item.serviceId) ?? 'Unknown Service',
            );
          }
        }
      }
    }

    const appointments = apptRows.map((a) => ({
      id: a.id,
      startTime: new Date(a.startAt).toISOString(),
      endTime: new Date(a.endAt).toISOString(),
      serviceName: itemServiceMap.get(a.id) ?? 'Unknown Service',
      customerName: a.guestName ?? (a.customerId ? `Customer ${a.customerId.slice(-6)}` : 'Walk-in'),
      status: a.status,
    }));

    // ── 3. Time-off blocks ─────────────────────────────────────────
    const timeOffRows = await tx
      .select({
        startAt: spaProviderTimeOff.startAt,
        endAt: spaProviderTimeOff.endAt,
        isAllDay: spaProviderTimeOff.isAllDay,
        reason: spaProviderTimeOff.reason,
      })
      .from(spaProviderTimeOff)
      .where(
        and(
          eq(spaProviderTimeOff.tenantId, tenantId),
          eq(spaProviderTimeOff.providerId, providerId),
          eq(spaProviderTimeOff.status, 'approved'),
          lte(spaProviderTimeOff.startAt, dayEnd),
          gte(spaProviderTimeOff.endAt, dayStart),
        ),
      );

    const timeOffBlocks = timeOffRows.map((t) => {
      if (t.isAllDay) {
        return {
          start: dayStart.toISOString(),
          end: dayEnd.toISOString(),
          reason: t.reason ?? '',
        };
      }
      return {
        start: new Date(t.startAt).toISOString(),
        end: new Date(t.endAt).toISOString(),
        reason: t.reason ?? '',
      };
    });

    return {
      providerId,
      date,
      availabilityWindows,
      appointments,
      timeOffBlocks,
    };
  });
}

// ── Internal resource matching ───────────────────────────────────────

/**
 * Find an available resource that satisfies the service's resource requirements
 * for a given time slot. Returns the first match or null.
 */
export function findAvailableResource(
  requirements: ResourceRequirement[],
  candidateResources: ResourceInfo[],
  appointmentsByResource: Map<string, TimeWindow[]>,
  slot: TimeWindow,
): { id: string; name: string } | null {
  // Check each mandatory requirement
  for (const req of requirements) {
    if (!req.isMandatory) continue;

    // Filter candidates matching this requirement
    const matching = candidateResources.filter((r) => {
      if (req.resourceId && r.id !== req.resourceId) return false;
      if (req.resourceType && r.resourceType !== req.resourceType) return false;
      return true;
    });

    // Find a free candidate
    let freeCount = 0;
    let firstFree: { id: string; name: string } | null = null;

    for (const resource of matching) {
      const resourceAppts = appointmentsByResource.get(resource.id) ?? [];
      const isBusy = resourceAppts.some(
        (appt) => appt.start < slot.end && appt.end > slot.start,
      );
      if (!isBusy) {
        freeCount++;
        if (!firstFree) {
          firstFree = { id: resource.id, name: resource.name };
        }
      }
    }

    if (freeCount < req.quantity) {
      return null; // Not enough resources to satisfy this requirement
    }

    // Return the first free resource (for the last requirement checked)
    if (firstFree) {
      return firstFree;
    }
  }

  // All mandatory requirements satisfied (or no mandatory requirements)
  // If there were non-mandatory requirements, still try to return a resource
  for (const req of requirements) {
    if (req.isMandatory) continue;

    const matching = candidateResources.filter((r) => {
      if (req.resourceId && r.id !== req.resourceId) return false;
      if (req.resourceType && r.resourceType !== req.resourceType) return false;
      return true;
    });

    for (const resource of matching) {
      const resourceAppts = appointmentsByResource.get(resource.id) ?? [];
      const isBusy = resourceAppts.some(
        (appt) => appt.start < slot.end && appt.end > slot.start,
      );
      if (!isBusy) {
        return { id: resource.id, name: resource.name };
      }
    }
  }

  // No resource requirements or all were non-mandatory and none matched
  // If all mandatory requirements were satisfied, return null (no resource needed)
  const hasMandatory = requirements.some((r) => r.isMandatory);
  if (!hasMandatory) {
    return null; // No mandatory requirements — caller interprets null as "no resource needed"
  }

  return null;
}
