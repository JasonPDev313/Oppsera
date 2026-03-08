import { eq, and, gte, lte, not, inArray, sql, count } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  spaServices,
  spaServiceCategories,
  spaProviders,
  spaProviderAvailability,
  spaProviderTimeOff,
  spaProviderServiceEligibility,
  spaAppointments,
} from '@oppsera/db';
import {
  enumerateDates,
  dayStartUtc,
  dayEndUtc,
  timeToMinutes,
} from '../helpers/availability-engine';

// ── Types ────────────────────────────────────────────────────────────

export interface GetAvailabilitySummaryInput {
  tenantId: string;
  locationId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  categoryId?: string;
}

export interface DaySlotSummary {
  date: string;
  totalMinutes: number;
  bookedMinutes: number;
  availableMinutes: number;
  availableSlots: number; // expressed as 30-min slot equivalents
  totalSlots: number;
  providerCount: number;
}

export interface AvailabilityCategorySummary {
  id: string;
  name: string;
  serviceCount: number;
}

export interface GetAvailabilitySummaryResult {
  days: DaySlotSummary[];
  categories: AvailabilityCategorySummary[];
}

/**
 * Compute per-day availability summary for a date range.
 *
 * Rather than running the full availability engine per-service per-day (expensive),
 * this counts total provider working minutes minus booked appointment minutes,
 * expressed as 30-min slot equivalents for display in the condensed/quick-reserve view.
 *
 * When a categoryId is provided, the summary is scoped to providers eligible
 * for at least one service in that category.
 */
export async function getAvailabilitySummary(
  input: GetAvailabilitySummaryInput,
): Promise<GetAvailabilitySummaryResult> {
  const { tenantId, locationId, startDate, endDate, categoryId } = input;

  return withTenant(tenantId, async (tx) => {
    // ── 1. Fetch service categories with counts ──────────────────
    const categoryRows = await tx
      .select({
        id: spaServiceCategories.id,
        name: spaServiceCategories.name,
        serviceCount: count(spaServices.id),
      })
      .from(spaServiceCategories)
      .leftJoin(
        spaServices,
        and(
          eq(spaServices.categoryId, spaServiceCategories.id),
          eq(spaServices.tenantId, tenantId),
          eq(spaServices.isActive, true),
        ),
      )
      .where(eq(spaServiceCategories.tenantId, tenantId))
      .groupBy(spaServiceCategories.id, spaServiceCategories.name)
      .orderBy(spaServiceCategories.sortOrder);

    const categories: AvailabilityCategorySummary[] = categoryRows.map((r) => ({
      id: r.id,
      name: r.name,
      serviceCount: Number(r.serviceCount),
    }));

    // ── 2. Determine which providers to include ──────────────────
    let providerIds: string[];

    if (categoryId) {
      // Find services in this category
      const catServices = await tx
        .select({ id: spaServices.id })
        .from(spaServices)
        .where(
          and(
            eq(spaServices.tenantId, tenantId),
            eq(spaServices.categoryId, categoryId),
            eq(spaServices.isActive, true),
          ),
        );

      const serviceIds = catServices.map((s) => s.id);
      if (serviceIds.length === 0) {
        return { days: enumerateDates(startDate, endDate).map((d) => emptyDay(d)), categories };
      }

      // Find providers eligible for at least one of these services
      const eligRows = await tx
        .select({ providerId: spaProviderServiceEligibility.providerId })
        .from(spaProviderServiceEligibility)
        .where(
          and(
            eq(spaProviderServiceEligibility.tenantId, tenantId),
            inArray(spaProviderServiceEligibility.serviceId, serviceIds),
          ),
        );

      providerIds = [...new Set(eligRows.map((e) => e.providerId))];
    } else {
      // All active providers at this location
      const allProviders = await tx
        .select({ id: spaProviders.id })
        .from(spaProviders)
        .where(
          and(
            eq(spaProviders.tenantId, tenantId),
            eq(spaProviders.isActive, true),
          ),
        );

      providerIds = allProviders.map((p) => p.id);
    }

    if (providerIds.length === 0) {
      return { days: enumerateDates(startDate, endDate).map((d) => emptyDay(d)), categories };
    }

    // Filter to active providers only
    const activeProviders = await tx
      .select({ id: spaProviders.id })
      .from(spaProviders)
      .where(
        and(
          inArray(spaProviders.id, providerIds),
          eq(spaProviders.tenantId, tenantId),
          eq(spaProviders.isActive, true),
        ),
      );

    const activeProviderIds = activeProviders.map((p) => p.id);
    if (activeProviderIds.length === 0) {
      return { days: enumerateDates(startDate, endDate).map((d) => emptyDay(d)), categories };
    }

    // ── 3. Fetch availability templates ──────────────────────────
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
          lte(spaProviderAvailability.effectiveFrom, endDate),
          sql`(${spaProviderAvailability.effectiveUntil} IS NULL OR ${spaProviderAvailability.effectiveUntil} >= ${startDate})`,
        ),
      );

    // ── 4. Fetch time-off blocks ─────────────────────────────────
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
          eq(spaProviderTimeOff.status, 'approved'),
          lte(spaProviderTimeOff.startAt, rangeEndDate),
          gte(spaProviderTimeOff.endAt, rangeStartDate),
        ),
      );

    // ── 5. Fetch existing appointments ───────────────────────────
    const appointments = await tx
      .select({
        providerId: spaAppointments.providerId,
        startAt: spaAppointments.startAt,
        endAt: spaAppointments.endAt,
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

    // ── 6. Compute per-day summary ───────────────────────────────
    const dates = enumerateDates(startDate, endDate);
    const days: DaySlotSummary[] = [];

    for (const dateStr of dates) {
      const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay();
      const dayStart = dayStartUtc(dateStr);
      const dayEnd = dayEndUtc(dateStr);

      let totalMinutes = 0;
      let bookedMinutes = 0;
      let workingProviderCount = 0;

      for (const pid of activeProviderIds) {
        // Find matching availability templates for this provider + day
        const templates = availabilityRows.filter((r) => {
          if (r.providerId !== pid) return false;
          if (r.dayOfWeek !== dayOfWeek) return false;
          if (r.effectiveFrom > dateStr) return false;
          if (r.effectiveUntil != null && r.effectiveUntil < dateStr) return false;
          if (locationId && r.locationId && r.locationId !== locationId) return false;
          return true;
        });

        if (templates.length === 0) continue;

        // Check if provider has all-day time-off
        const providerTimeOff = timeOffRows.filter((t) => t.providerId === pid);
        const hasAllDayOff = providerTimeOff.some((t) => {
          if (t.isAllDay) {
            const tStart = new Date(t.startAt);
            const tEnd = new Date(t.endAt);
            return tStart <= dayEnd && tEnd >= dayStart;
          }
          return false;
        });

        if (hasAllDayOff) continue;

        // Calculate total working minutes from templates
        let providerWorkMinutes = 0;
        for (const t of templates) {
          const startMin = timeToMinutes(t.startTime);
          const endMin = timeToMinutes(t.endTime);
          providerWorkMinutes += Math.max(0, endMin - startMin);
        }

        // Subtract partial time-off (non-all-day)
        for (const toff of providerTimeOff) {
          if (toff.isAllDay) continue;
          const tStart = new Date(toff.startAt);
          const tEnd = new Date(toff.endAt);
          if (tStart < dayEnd && tEnd > dayStart) {
            // Calculate overlap in minutes with working hours
            const overlapStartMs = Math.max(tStart.getTime(), dayStart.getTime());
            const overlapEndMs = Math.min(tEnd.getTime(), dayEnd.getTime());
            const overlapMinutes = Math.max(0, (overlapEndMs - overlapStartMs) / 60_000);
            providerWorkMinutes = Math.max(0, providerWorkMinutes - overlapMinutes);
          }
        }

        if (providerWorkMinutes <= 0) continue;

        workingProviderCount++;
        totalMinutes += providerWorkMinutes;

        // Sum booked minutes for this provider on this day
        const providerAppts = appointments.filter((a) => {
          if (a.providerId !== pid) return false;
          const aStart = new Date(a.startAt);
          const aEnd = new Date(a.endAt);
          return aStart < dayEnd && aEnd > dayStart;
        });

        for (const appt of providerAppts) {
          const aStart = new Date(appt.startAt);
          const aEnd = new Date(appt.endAt);
          // Clamp to this day
          const clampedStart = Math.max(aStart.getTime(), dayStart.getTime());
          const clampedEnd = Math.min(aEnd.getTime(), dayEnd.getTime());
          const apptMinutes = Math.max(0, (clampedEnd - clampedStart) / 60_000);
          bookedMinutes += apptMinutes;
        }
      }

      // Don't let booked exceed total (edge case with cross-day appointments)
      bookedMinutes = Math.min(bookedMinutes, totalMinutes);
      const availableMinutes = totalMinutes - bookedMinutes;

      days.push({
        date: dateStr,
        totalMinutes,
        bookedMinutes,
        availableMinutes,
        availableSlots: Math.floor(availableMinutes / 30),
        totalSlots: Math.floor(totalMinutes / 30),
        providerCount: workingProviderCount,
      });
    }

    return { days, categories };
  });
}

function emptyDay(date: string): DaySlotSummary {
  return {
    date,
    totalMinutes: 0,
    bookedMinutes: 0,
    availableMinutes: 0,
    availableSlots: 0,
    totalSlots: 0,
    providerCount: 0,
  };
}
