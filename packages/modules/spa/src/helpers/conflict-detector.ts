import { and, eq, not, inArray, lt, gt, sql } from 'drizzle-orm';
import { withTenant, spaAppointments, spaProviderAvailability, spaProviderTimeOff, spaResources } from '@oppsera/db';
import { CONFLICT_EXCLUDED_STATUSES } from './appointment-transitions';

// ══════════════════════════════════════════════════════════════════
// Conflict Detection for Spa Appointment Scheduling
// ══════════════════════════════════════════════════════════════════
//
// Detects scheduling conflicts for appointments. Used by the
// create / update / reschedule appointment commands.
//
// Checks performed:
//   1. Provider availability (working hours for the day)
//   2. Provider time-off (approved leave)
//   3. Provider existing appointments (overlapping active bookings)
//   4. Resource availability (overlapping resource bookings)
//   5. Customer overlap (customer already booked at this time)
// ══════════════════════════════════════════════════════════════════

export interface ConflictCheckParams {
  tenantId: string;
  providerId: string;
  startTime: Date;
  endTime: Date;
  locationId?: string;
  customerId?: string;
  resourceIds?: string[];
  excludeAppointmentId?: string; // For reschedule — exclude current appointment
}

export interface ConflictResult {
  hasConflicts: boolean;
  conflicts: ConflictDetail[];
}

export interface ConflictDetail {
  type: 'provider_busy' | 'resource_busy' | 'customer_overlap' | 'provider_time_off' | 'outside_availability';
  description: string;
  conflictingAppointmentId?: string;
  conflictingResourceId?: string;
}

/**
 * Detects all scheduling conflicts for a proposed appointment time slot.
 *
 * Runs all five conflict checks in parallel inside a single withTenant
 * transaction (shared RLS scope). Returns a consolidated result with
 * detailed descriptions for each conflict found.
 */
export async function detectConflicts(params: ConflictCheckParams): Promise<ConflictResult> {
  const { tenantId, providerId, startTime, endTime, locationId, customerId, resourceIds, excludeAppointmentId } = params;

  const conflicts: ConflictDetail[] = await withTenant(tenantId, async (tx) => {
    const results: ConflictDetail[] = [];

    // Run all conflict checks in parallel for performance
    const [
      availabilityConflicts,
      timeOffConflicts,
      providerConflicts,
      resourceConflicts,
      customerConflicts,
    ] = await Promise.all([
      checkProviderAvailability(tx, tenantId, providerId, startTime, endTime, locationId),
      checkProviderTimeOff(tx, tenantId, providerId, startTime, endTime),
      checkProviderAppointments(tx, tenantId, providerId, startTime, endTime, excludeAppointmentId),
      resourceIds && resourceIds.length > 0
        ? checkResourceAvailability(tx, tenantId, resourceIds, startTime, endTime, excludeAppointmentId)
        : Promise.resolve([]),
      customerId
        ? checkCustomerOverlap(tx, tenantId, customerId, startTime, endTime, excludeAppointmentId)
        : Promise.resolve([]),
    ]);

    results.push(...availabilityConflicts);
    results.push(...timeOffConflicts);
    results.push(...providerConflicts);
    results.push(...resourceConflicts);
    results.push(...customerConflicts);

    return results;
  });

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}

// ── Internal Check Functions ──────────────────────────────────────

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * Check 1: Provider Availability (working hours)
 *
 * Verifies the proposed time falls within the provider's configured
 * availability for that day of the week. Uses effective date ranges
 * to support schedule versioning.
 */
async function checkProviderAvailability(
  tx: Tx,
  tenantId: string,
  providerId: string,
  startTime: Date,
  endTime: Date,
  locationId?: string,
): Promise<ConflictDetail[]> {
  const dayOfWeek = startTime.getUTCDay();
  const appointmentDate = startTime.toISOString().split('T')[0]!;

  // Build conditions for matching availability slots
  const conditions = [
    eq(spaProviderAvailability.tenantId, tenantId),
    eq(spaProviderAvailability.providerId, providerId),
    eq(spaProviderAvailability.dayOfWeek, dayOfWeek),
    eq(spaProviderAvailability.isActive, true),
  ];

  const slots = await tx
    .select({
      startTime: spaProviderAvailability.startTime,
      endTime: spaProviderAvailability.endTime,
      locationId: spaProviderAvailability.locationId,
      effectiveFrom: spaProviderAvailability.effectiveFrom,
      effectiveUntil: spaProviderAvailability.effectiveUntil,
    })
    .from(spaProviderAvailability)
    .where(and(...conditions));

  // Filter to slots effective on this date
  const effectiveSlots = Array.from(slots as Iterable<typeof slots[number]>).filter((slot) => {
    if (slot.effectiveFrom > appointmentDate) return false;
    if (slot.effectiveUntil && slot.effectiveUntil < appointmentDate) return false;
    // If a locationId filter is specified, only match that location (or unscoped slots)
    if (locationId && slot.locationId && slot.locationId !== locationId) return false;
    return true;
  });

  // If no availability records exist at all for this provider, skip this check.
  // Some setups may not configure explicit availability (always available).
  if (effectiveSlots.length === 0) {
    // Check whether the provider has ANY availability configured
    const anySlots = await tx
      .select({ id: spaProviderAvailability.id })
      .from(spaProviderAvailability)
      .where(
        and(
          eq(spaProviderAvailability.tenantId, tenantId),
          eq(spaProviderAvailability.providerId, providerId),
          eq(spaProviderAvailability.isActive, true),
        ),
      )
      .limit(1);

    const hasAny = Array.from(anySlots as Iterable<typeof anySlots[number]>);
    if (hasAny.length === 0) {
      // Provider has no availability configured — treat as unrestricted
      return [];
    }

    // Provider has availability configured but none covers this day/date
    return [{
      type: 'outside_availability' as const,
      description: `Provider is not available on ${getDayName(dayOfWeek)} (${appointmentDate})`,
    }];
  }

  // Extract appointment start/end as HH:MM strings for comparison with time columns
  const apptStartTime = formatTimeHHMM(startTime);
  const apptEndTime = formatTimeHHMM(endTime);

  // Check if the appointment falls within any available slot
  const isWithinAvailability = effectiveSlots.some((slot) => {
    return slot.startTime <= apptStartTime && slot.endTime >= apptEndTime;
  });

  if (!isWithinAvailability) {
    return [{
      type: 'outside_availability' as const,
      description: `Appointment time ${apptStartTime}–${apptEndTime} is outside provider availability on ${getDayName(dayOfWeek)}`,
    }];
  }

  return [];
}

/**
 * Check 2: Provider Time Off
 *
 * Checks whether the provider has any approved time-off that overlaps
 * with the proposed appointment time range.
 */
async function checkProviderTimeOff(
  tx: Tx,
  tenantId: string,
  providerId: string,
  startTime: Date,
  endTime: Date,
): Promise<ConflictDetail[]> {
  // Overlap: existing.startAt < params.endTime AND existing.endAt > params.startTime
  const timeOffRecords = await tx
    .select({
      id: spaProviderTimeOff.id,
      startAt: spaProviderTimeOff.startAt,
      endAt: spaProviderTimeOff.endAt,
      reason: spaProviderTimeOff.reason,
      isAllDay: spaProviderTimeOff.isAllDay,
    })
    .from(spaProviderTimeOff)
    .where(
      and(
        eq(spaProviderTimeOff.tenantId, tenantId),
        eq(spaProviderTimeOff.providerId, providerId),
        eq(spaProviderTimeOff.status, 'approved'),
        lt(spaProviderTimeOff.startAt, endTime),
        gt(spaProviderTimeOff.endAt, startTime),
      ),
    );

  const records = Array.from(timeOffRecords as Iterable<typeof timeOffRecords[number]>);

  return records.map((record) => ({
    type: 'provider_time_off' as const,
    description: record.isAllDay
      ? `Provider has approved all-day time off${record.reason ? ` (${record.reason})` : ''}`
      : `Provider has approved time off from ${formatDateTime(record.startAt)} to ${formatDateTime(record.endAt)}${record.reason ? ` (${record.reason})` : ''}`,
  }));
}

/**
 * Check 3: Provider Existing Appointments
 *
 * Finds any active appointments for this provider that overlap with
 * the proposed time range. Excludes canceled and no-show appointments.
 */
async function checkProviderAppointments(
  tx: Tx,
  tenantId: string,
  providerId: string,
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: string,
): Promise<ConflictDetail[]> {
  const conditions = [
    eq(spaAppointments.tenantId, tenantId),
    eq(spaAppointments.providerId, providerId),
    not(inArray(spaAppointments.status, CONFLICT_EXCLUDED_STATUSES)),
    // Overlap: existing.startAt < endTime AND existing.endAt > startTime
    lt(spaAppointments.startAt, endTime),
    gt(spaAppointments.endAt, startTime),
  ];

  if (excludeAppointmentId) {
    conditions.push(
      sql`${spaAppointments.id} != ${excludeAppointmentId}`,
    );
  }

  const overlapping = await tx
    .select({
      id: spaAppointments.id,
      appointmentNumber: spaAppointments.appointmentNumber,
      startAt: spaAppointments.startAt,
      endAt: spaAppointments.endAt,
      status: spaAppointments.status,
    })
    .from(spaAppointments)
    .where(and(...conditions));

  const results = Array.from(overlapping as Iterable<typeof overlapping[number]>);

  return results.map((appt) => ({
    type: 'provider_busy' as const,
    description: `Provider has an existing appointment (${appt.appointmentNumber}, ${appt.status}) from ${formatDateTime(appt.startAt)} to ${formatDateTime(appt.endAt)}`,
    conflictingAppointmentId: appt.id,
  }));
}

/**
 * Check 4: Resource Availability
 *
 * Checks whether any of the required resources are already booked
 * by another appointment in the proposed time range.
 */
async function checkResourceAvailability(
  tx: Tx,
  tenantId: string,
  resourceIds: string[],
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: string,
): Promise<ConflictDetail[]> {
  if (resourceIds.length === 0) return [];

  const conflicts: ConflictDetail[] = [];

  // Check each resource individually so we can report which specific resource is busy
  for (const resourceId of resourceIds) {
    const conditions = [
      eq(spaAppointments.tenantId, tenantId),
      eq(spaAppointments.resourceId, resourceId),
      not(inArray(spaAppointments.status, CONFLICT_EXCLUDED_STATUSES)),
      // Overlap: existing.startAt < endTime AND existing.endAt > startTime
      lt(spaAppointments.startAt, endTime),
      gt(spaAppointments.endAt, startTime),
    ];

    if (excludeAppointmentId) {
      conditions.push(
        sql`${spaAppointments.id} != ${excludeAppointmentId}`,
      );
    }

    const overlapping = await tx
      .select({
        id: spaAppointments.id,
        appointmentNumber: spaAppointments.appointmentNumber,
        startAt: spaAppointments.startAt,
        endAt: spaAppointments.endAt,
      })
      .from(spaAppointments)
      .where(and(...conditions));

    const results = Array.from(overlapping as Iterable<typeof overlapping[number]>);

    if (results.length > 0) {
      // Look up the resource name for a more useful description
      const resourceRows = await tx
        .select({ name: spaResources.name })
        .from(spaResources)
        .where(
          and(
            eq(spaResources.tenantId, tenantId),
            eq(spaResources.id, resourceId),
          ),
        )
        .limit(1);

      const resourceList = Array.from(resourceRows as Iterable<typeof resourceRows[number]>);
      const resourceName = resourceList.length > 0 ? resourceList[0]!.name : resourceId;

      for (const appt of results) {
        conflicts.push({
          type: 'resource_busy' as const,
          description: `Resource "${resourceName}" is occupied by appointment ${appt.appointmentNumber} from ${formatDateTime(appt.startAt)} to ${formatDateTime(appt.endAt)}`,
          conflictingAppointmentId: appt.id,
          conflictingResourceId: resourceId,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Check 5: Customer Overlap
 *
 * Checks whether the customer already has an active appointment that
 * overlaps with the proposed time range. Prevents double-booking a guest.
 */
async function checkCustomerOverlap(
  tx: Tx,
  tenantId: string,
  customerId: string,
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: string,
): Promise<ConflictDetail[]> {
  const conditions = [
    eq(spaAppointments.tenantId, tenantId),
    eq(spaAppointments.customerId, customerId),
    not(inArray(spaAppointments.status, CONFLICT_EXCLUDED_STATUSES)),
    // Overlap: existing.startAt < endTime AND existing.endAt > startTime
    lt(spaAppointments.startAt, endTime),
    gt(spaAppointments.endAt, startTime),
  ];

  if (excludeAppointmentId) {
    conditions.push(
      sql`${spaAppointments.id} != ${excludeAppointmentId}`,
    );
  }

  const overlapping = await tx
    .select({
      id: spaAppointments.id,
      appointmentNumber: spaAppointments.appointmentNumber,
      startAt: spaAppointments.startAt,
      endAt: spaAppointments.endAt,
    })
    .from(spaAppointments)
    .where(and(...conditions));

  const results = Array.from(overlapping as Iterable<typeof overlapping[number]>);

  return results.map((appt) => ({
    type: 'customer_overlap' as const,
    description: `Customer already has appointment ${appt.appointmentNumber} from ${formatDateTime(appt.startAt)} to ${formatDateTime(appt.endAt)}`,
    conflictingAppointmentId: appt.id,
  }));
}

// ── Utility Functions ─────────────────────────────────────────────

function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] ?? `Day ${dayOfWeek}`;
}

/**
 * Formats a Date to HH:MM string in UTC for comparison with time columns.
 */
function formatTimeHHMM(date: Date): string {
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Formats a Date to a human-readable datetime string for conflict descriptions.
 */
function formatDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 16);
}
