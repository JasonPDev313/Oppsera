import { eq, and, gte, lte, sql } from 'drizzle-orm';
import {
  withTenant,
  spaAppointments,
  spaAppointmentItems,
  spaServices,
  spaProviders,
  spaProviderAvailability,
  spaProviderTimeOff,
} from '@oppsera/db';

export interface ScheduleAppointment {
  id: string;
  appointmentNumber: string;
  customerId: string | null;
  guestName: string | null;
  resourceId: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
  bookingSource: string;
  services: Array<{
    serviceId: string;
    serviceName: string;
    durationMinutes: number;
    status: string;
  }>;
}

export interface ScheduleAvailabilityBlock {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  locationId: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export interface ScheduleTimeOff {
  id: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  isAllDay: boolean;
  status: string;
}

export interface ProviderScheduleResult {
  provider: {
    id: string;
    displayName: string;
    color: string | null;
    photoUrl: string | null;
    maxDailyAppointments: number | null;
    breakDurationMinutes: number;
  };
  appointments: ScheduleAppointment[];
  availability: ScheduleAvailabilityBlock[];
  timeOff: ScheduleTimeOff[];
}

/**
 * Get a provider's schedule for a specific date.
 * Returns their appointments, availability blocks, and time-off entries.
 * Used for the provider column in calendar view.
 */
export async function getProviderSchedule(input: {
  tenantId: string;
  providerId: string;
  date: string;
}): Promise<ProviderScheduleResult | null> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch provider info
    const [provider] = await tx
      .select({
        id: spaProviders.id,
        displayName: spaProviders.displayName,
        color: spaProviders.color,
        photoUrl: spaProviders.photoUrl,
        maxDailyAppointments: spaProviders.maxDailyAppointments,
        breakDurationMinutes: spaProviders.breakDurationMinutes,
      })
      .from(spaProviders)
      .where(
        and(
          eq(spaProviders.id, input.providerId),
          eq(spaProviders.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!provider) {
      return null;
    }

    // Date boundaries for the requested day
    const dateObj = new Date(input.date);
    const dayStart = new Date(dateObj);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dateObj);
    dayEnd.setHours(23, 59, 59, 999);
    const dayOfWeek = dateObj.getDay(); // 0-6

    // Fetch appointments, availability, and time-off in parallel
    const [appointmentRows, availabilityRows, timeOffRows] = await Promise.all([
      // Appointments for this provider on this date
      tx
        .select({
          id: spaAppointments.id,
          appointmentNumber: spaAppointments.appointmentNumber,
          customerId: spaAppointments.customerId,
          guestName: spaAppointments.guestName,
          resourceId: spaAppointments.resourceId,
          startAt: spaAppointments.startAt,
          endAt: spaAppointments.endAt,
          status: spaAppointments.status,
          bookingSource: spaAppointments.bookingSource,
        })
        .from(spaAppointments)
        .where(
          and(
            eq(spaAppointments.tenantId, input.tenantId),
            eq(spaAppointments.providerId, input.providerId),
            gte(spaAppointments.startAt, dayStart),
            lte(spaAppointments.startAt, dayEnd),
            sql`${spaAppointments.status} NOT IN ('canceled')` as ReturnType<typeof eq>,
          ),
        )
        .orderBy(spaAppointments.startAt),

      // Availability blocks that apply on this day of week and date
      tx
        .select({
          id: spaProviderAvailability.id,
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
            eq(spaProviderAvailability.tenantId, input.tenantId),
            eq(spaProviderAvailability.providerId, input.providerId),
            eq(spaProviderAvailability.dayOfWeek, dayOfWeek),
            eq(spaProviderAvailability.isActive, true),
            lte(spaProviderAvailability.effectiveFrom, input.date),
            sql`(${spaProviderAvailability.effectiveUntil} IS NULL OR ${spaProviderAvailability.effectiveUntil} >= ${input.date})` as ReturnType<typeof eq>,
          ),
        ),

      // Time-off entries that overlap with this date
      tx
        .select({
          id: spaProviderTimeOff.id,
          startAt: spaProviderTimeOff.startAt,
          endAt: spaProviderTimeOff.endAt,
          reason: spaProviderTimeOff.reason,
          isAllDay: spaProviderTimeOff.isAllDay,
          status: spaProviderTimeOff.status,
        })
        .from(spaProviderTimeOff)
        .where(
          and(
            eq(spaProviderTimeOff.tenantId, input.tenantId),
            eq(spaProviderTimeOff.providerId, input.providerId),
            lte(spaProviderTimeOff.startAt, dayEnd),
            gte(spaProviderTimeOff.endAt, dayStart),
            sql`${spaProviderTimeOff.status} != 'rejected'` as ReturnType<typeof eq>,
          ),
        ),
    ]);

    // Batch-fetch appointment items for service names
    const itemsByAppointment = new Map<
      string,
      Array<{ serviceId: string; serviceName: string; durationMinutes: number; status: string }>
    >();

    if (appointmentRows.length > 0) {
      const appointmentIds = appointmentRows.map((r) => r.id);
      const itemRows = await tx
        .select({
          appointmentId: spaAppointmentItems.appointmentId,
          serviceId: spaAppointmentItems.serviceId,
          serviceName: spaServices.name,
          durationMinutes: spaServices.durationMinutes,
          status: spaAppointmentItems.status,
        })
        .from(spaAppointmentItems)
        .innerJoin(spaServices, eq(spaAppointmentItems.serviceId, spaServices.id))
        .where(
          and(
            eq(spaAppointmentItems.tenantId, input.tenantId),
            sql`${spaAppointmentItems.appointmentId} IN (${sql.join(
              appointmentIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        )
        .orderBy(spaAppointmentItems.sortOrder);

      for (const item of itemRows) {
        const list = itemsByAppointment.get(item.appointmentId) ?? [];
        list.push({
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          durationMinutes: item.durationMinutes,
          status: item.status,
        });
        itemsByAppointment.set(item.appointmentId, list);
      }
    }

    const appointments: ScheduleAppointment[] = appointmentRows.map((r) => ({
      id: r.id,
      appointmentNumber: r.appointmentNumber,
      customerId: r.customerId ?? null,
      guestName: r.guestName ?? null,
      resourceId: r.resourceId ?? null,
      startAt: r.startAt,
      endAt: r.endAt,
      status: r.status,
      bookingSource: r.bookingSource,
      services: itemsByAppointment.get(r.id) ?? [],
    }));

    const availability: ScheduleAvailabilityBlock[] = availabilityRows.map((r) => ({
      id: r.id,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      locationId: r.locationId ?? null,
      effectiveFrom: r.effectiveFrom,
      effectiveUntil: r.effectiveUntil ?? null,
    }));

    const timeOff: ScheduleTimeOff[] = timeOffRows.map((r) => ({
      id: r.id,
      startAt: r.startAt,
      endAt: r.endAt,
      reason: r.reason ?? null,
      isAllDay: r.isAllDay,
      status: r.status,
    }));

    return {
      provider: {
        id: provider.id,
        displayName: provider.displayName,
        color: provider.color ?? null,
        photoUrl: provider.photoUrl ?? null,
        maxDailyAppointments: provider.maxDailyAppointments ?? null,
        breakDurationMinutes: provider.breakDurationMinutes,
      },
      appointments,
      availability,
      timeOff,
    };
  });
}
