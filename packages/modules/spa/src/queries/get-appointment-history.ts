import { eq, and, lt, desc, sql } from 'drizzle-orm';
import {
  withTenant,
  spaAppointments,
  spaAppointmentItems,
  spaServices,
  spaProviders,
} from '@oppsera/db';

export interface AppointmentHistoryInput {
  tenantId: string;
  customerId: string;
  locationId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface AppointmentHistoryServiceRow {
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  priceCents: number;
  finalPriceCents: number;
  status: string;
}

export interface AppointmentHistoryRow {
  id: string;
  appointmentNumber: string;
  locationId: string | null;
  providerId: string | null;
  providerName: string | null;
  providerColor: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
  bookingSource: string;
  notes: string | null;
  cancellationReason: string | null;
  canceledAt: Date | null;
  noShowFeeCharged: boolean;
  orderId: string | null;
  createdAt: Date;
  services: AppointmentHistoryServiceRow[];
}

export interface AppointmentHistoryResult {
  items: AppointmentHistoryRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Get a customer's appointment history with cursor pagination.
 * Returns appointments with their services, ordered by startAt descending (most recent first).
 * Used by the customer profile and rebooking UI.
 */
export async function getAppointmentHistory(
  input: AppointmentHistoryInput,
): Promise<AppointmentHistoryResult> {
  const limit = Math.min(input.limit ?? 25, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(spaAppointments.tenantId, input.tenantId),
      eq(spaAppointments.customerId, input.customerId),
    ];

    if (input.cursor) {
      conditions.push(lt(spaAppointments.id, input.cursor));
    }

    if (input.locationId) {
      conditions.push(eq(spaAppointments.locationId, input.locationId));
    }

    if (input.status) {
      conditions.push(eq(spaAppointments.status, input.status));
    }

    // Fetch appointments with provider info
    const rows = await tx
      .select({
        id: spaAppointments.id,
        appointmentNumber: spaAppointments.appointmentNumber,
        locationId: spaAppointments.locationId,
        providerId: spaAppointments.providerId,
        providerName: spaProviders.displayName,
        providerColor: spaProviders.color,
        startAt: spaAppointments.startAt,
        endAt: spaAppointments.endAt,
        status: spaAppointments.status,
        bookingSource: spaAppointments.bookingSource,
        notes: spaAppointments.notes,
        cancellationReason: spaAppointments.cancellationReason,
        canceledAt: spaAppointments.canceledAt,
        noShowFeeCharged: spaAppointments.noShowFeeCharged,
        orderId: spaAppointments.orderId,
        createdAt: spaAppointments.createdAt,
      })
      .from(spaAppointments)
      .leftJoin(spaProviders, eq(spaAppointments.providerId, spaProviders.id))
      .where(and(...conditions))
      .orderBy(desc(spaAppointments.startAt), desc(spaAppointments.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    if (sliced.length === 0) {
      return { items: [], cursor: null, hasMore: false };
    }

    // Batch-fetch appointment items with service details
    const appointmentIds = sliced.map((r) => r.id);
    const itemRows = await tx
      .select({
        appointmentId: spaAppointmentItems.appointmentId,
        serviceId: spaAppointmentItems.serviceId,
        serviceName: spaServices.name,
        durationMinutes: spaServices.durationMinutes,
        priceCents: spaAppointmentItems.priceCents,
        finalPriceCents: spaAppointmentItems.finalPriceCents,
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

    // Group items by appointment
    const itemsByAppointment = new Map<string, AppointmentHistoryServiceRow[]>();
    for (const item of itemRows) {
      const list = itemsByAppointment.get(item.appointmentId) ?? [];
      list.push({
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        durationMinutes: item.durationMinutes,
        priceCents: item.priceCents,
        finalPriceCents: item.finalPriceCents,
        status: item.status,
      });
      itemsByAppointment.set(item.appointmentId, list);
    }

    const items: AppointmentHistoryRow[] = sliced.map((r) => ({
      id: r.id,
      appointmentNumber: r.appointmentNumber,
      locationId: r.locationId ?? null,
      providerId: r.providerId ?? null,
      providerName: r.providerName ?? null,
      providerColor: r.providerColor ?? null,
      startAt: r.startAt,
      endAt: r.endAt,
      status: r.status,
      bookingSource: r.bookingSource,
      notes: r.notes ?? null,
      cancellationReason: r.cancellationReason ?? null,
      canceledAt: r.canceledAt ?? null,
      noShowFeeCharged: r.noShowFeeCharged,
      orderId: r.orderId ?? null,
      createdAt: r.createdAt,
      services: itemsByAppointment.get(r.id) ?? [],
    }));

    return {
      items,
      cursor: hasMore ? sliced[sliced.length - 1]!.id : null,
      hasMore,
    };
  });
}
