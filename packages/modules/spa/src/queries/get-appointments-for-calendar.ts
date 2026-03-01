import { eq, and, gte, lte, sql } from 'drizzle-orm';
import {
  withTenant,
  spaAppointments,
  spaAppointmentItems,
  spaServices,
  spaProviders,
} from '@oppsera/db';

export interface CalendarAppointmentItem {
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
}

export interface CalendarAppointment {
  id: string;
  appointmentNumber: string;
  customerId: string | null;
  guestName: string | null;
  providerId: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
  bookingSource: string;
  orderId: string | null;
  services: CalendarAppointmentItem[];
}

export interface CalendarProviderColumn {
  providerId: string;
  providerName: string;
  providerColor: string | null;
  appointments: CalendarAppointment[];
}

export interface CalendarResult {
  providers: CalendarProviderColumn[];
  unassigned: CalendarAppointment[];
}

/**
 * Returns appointments grouped by provider for calendar rendering.
 * Optimized for minimal fields needed by the calendar view.
 * Appointments without a provider are returned in `unassigned`.
 */
export async function getAppointmentsForCalendar(input: {
  tenantId: string;
  locationId: string;
  startDate: string;
  endDate: string;
  providerIds?: string[];
}): Promise<CalendarResult> {
  return withTenant(input.tenantId, async (tx) => {
    const startTs = new Date(input.startDate);
    const endTs = new Date(input.endDate);

    const conditions: ReturnType<typeof eq>[] = [
      eq(spaAppointments.tenantId, input.tenantId),
      eq(spaAppointments.locationId, input.locationId),
      gte(spaAppointments.startAt, startTs),
      lte(spaAppointments.startAt, endTs),
    ];

    // Only show active appointment statuses on calendar (exclude canceled)
    conditions.push(
      sql`${spaAppointments.status} NOT IN ('canceled')` as ReturnType<typeof eq>,
    );

    if (input.providerIds && input.providerIds.length > 0) {
      conditions.push(
        sql`${spaAppointments.providerId} IN (${sql.join(
          input.providerIds.map((id) => sql`${id}`),
          sql`, `,
        )})` as ReturnType<typeof eq>,
      );
    }

    // Fetch appointments
    const rows = await tx
      .select({
        id: spaAppointments.id,
        appointmentNumber: spaAppointments.appointmentNumber,
        customerId: spaAppointments.customerId,
        guestName: spaAppointments.guestName,
        providerId: spaAppointments.providerId,
        startAt: spaAppointments.startAt,
        endAt: spaAppointments.endAt,
        status: spaAppointments.status,
        bookingSource: spaAppointments.bookingSource,
        orderId: spaAppointments.orderId,
      })
      .from(spaAppointments)
      .where(and(...conditions))
      .orderBy(spaAppointments.startAt);

    if (rows.length === 0) {
      return { providers: [], unassigned: [] };
    }

    // Batch-fetch appointment items for service names
    const appointmentIds = rows.map((r) => r.id);
    const itemRows = await tx
      .select({
        appointmentId: spaAppointmentItems.appointmentId,
        serviceId: spaAppointmentItems.serviceId,
        serviceName: spaServices.name,
        serviceDurationMinutes: spaServices.durationMinutes,
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

    // Group items by appointment
    const itemsByAppointment = new Map<string, CalendarAppointmentItem[]>();
    for (const item of itemRows) {
      const list = itemsByAppointment.get(item.appointmentId) ?? [];
      list.push({
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        durationMinutes: item.serviceDurationMinutes,
      });
      itemsByAppointment.set(item.appointmentId, list);
    }

    // Build calendar appointments
    const calendarAppointments: CalendarAppointment[] = rows.map((r) => ({
      id: r.id,
      appointmentNumber: r.appointmentNumber,
      customerId: r.customerId ?? null,
      guestName: r.guestName ?? null,
      providerId: r.providerId ?? null,
      startAt: r.startAt,
      endAt: r.endAt,
      status: r.status,
      bookingSource: r.bookingSource,
      orderId: r.orderId ?? null,
      services: itemsByAppointment.get(r.id) ?? [],
    }));

    // Collect unique provider IDs from appointments
    const providerIdSet = new Set<string>();
    for (const appt of calendarAppointments) {
      if (appt.providerId) {
        providerIdSet.add(appt.providerId);
      }
    }

    // Fetch provider display data
    const providerMap = new Map<string, { name: string; color: string | null }>();
    if (providerIdSet.size > 0) {
      const providerIds = Array.from(providerIdSet);
      const providerRows = await tx
        .select({
          id: spaProviders.id,
          displayName: spaProviders.displayName,
          color: spaProviders.color,
        })
        .from(spaProviders)
        .where(
          and(
            eq(spaProviders.tenantId, input.tenantId),
            sql`${spaProviders.id} IN (${sql.join(
              providerIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        );

      for (const p of providerRows) {
        providerMap.set(p.id, { name: p.displayName, color: p.color ?? null });
      }
    }

    // Group appointments by provider
    const appointmentsByProvider = new Map<string, CalendarAppointment[]>();
    const unassigned: CalendarAppointment[] = [];

    for (const appt of calendarAppointments) {
      if (appt.providerId) {
        const list = appointmentsByProvider.get(appt.providerId) ?? [];
        list.push(appt);
        appointmentsByProvider.set(appt.providerId, list);
      } else {
        unassigned.push(appt);
      }
    }

    const providers: CalendarProviderColumn[] = [];
    for (const [providerId, appointments] of appointmentsByProvider) {
      const providerInfo = providerMap.get(providerId);
      providers.push({
        providerId,
        providerName: providerInfo?.name ?? 'Unknown',
        providerColor: providerInfo?.color ?? null,
        appointments,
      });
    }

    // Sort providers by name for consistent calendar column ordering
    providers.sort((a, b) => a.providerName.localeCompare(b.providerName));

    return { providers, unassigned };
  });
}
