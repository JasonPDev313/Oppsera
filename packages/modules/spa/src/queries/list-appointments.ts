import { eq, and, lt, gte, lte, desc, sql } from 'drizzle-orm';
import {
  withTenant,
  spaAppointments,
  spaAppointmentItems,
  spaServices,
  spaProviders,
  spaResources,
} from '@oppsera/db';

export interface ListAppointmentsInput {
  tenantId: string;
  locationId?: string;
  providerId?: string;
  customerId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export interface AppointmentServiceRow {
  id: string;
  serviceId: string;
  serviceName: string;
  addonId: string | null;
  providerId: string | null;
  providerName: string | null;
  startAt: Date;
  endAt: Date;
  priceCents: number;
  finalPriceCents: number;
  discountAmountCents: number;
  status: string;
  sortOrder: number;
}

export interface AppointmentListRow {
  id: string;
  appointmentNumber: string;
  customerId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  locationId: string | null;
  providerId: string | null;
  providerName: string | null;
  providerColor: string | null;
  resourceId: string | null;
  resourceName: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
  bookingSource: string;
  notes: string | null;
  depositAmountCents: number;
  depositStatus: string;
  orderId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  services: AppointmentServiceRow[];
}

export interface ListAppointmentsResult {
  items: AppointmentListRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * List appointments with filters and cursor pagination.
 * Joins with appointment items, services, providers, and resources for display data.
 * Sort by startAt descending by default.
 */
export async function listAppointments(
  input: ListAppointmentsInput,
): Promise<ListAppointmentsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(spaAppointments.tenantId, input.tenantId),
    ];

    if (input.cursor) {
      conditions.push(lt(spaAppointments.id, input.cursor));
    }

    if (input.locationId) {
      conditions.push(eq(spaAppointments.locationId, input.locationId));
    }

    if (input.providerId) {
      conditions.push(eq(spaAppointments.providerId, input.providerId));
    }

    if (input.customerId) {
      conditions.push(eq(spaAppointments.customerId, input.customerId));
    }

    if (input.status) {
      conditions.push(eq(spaAppointments.status, input.status));
    }

    if (input.startDate) {
      conditions.push(
        gte(spaAppointments.startAt, new Date(input.startDate)),
      );
    }

    if (input.endDate) {
      conditions.push(
        lte(spaAppointments.startAt, new Date(input.endDate)),
      );
    }

    // Fetch appointments with provider + resource names
    const rows = await tx
      .select({
        id: spaAppointments.id,
        appointmentNumber: spaAppointments.appointmentNumber,
        customerId: spaAppointments.customerId,
        guestName: spaAppointments.guestName,
        guestEmail: spaAppointments.guestEmail,
        guestPhone: spaAppointments.guestPhone,
        locationId: spaAppointments.locationId,
        providerId: spaAppointments.providerId,
        providerName: spaProviders.displayName,
        providerColor: spaProviders.color,
        resourceId: spaAppointments.resourceId,
        resourceName: spaResources.name,
        startAt: spaAppointments.startAt,
        endAt: spaAppointments.endAt,
        status: spaAppointments.status,
        bookingSource: spaAppointments.bookingSource,
        notes: spaAppointments.notes,
        depositAmountCents: spaAppointments.depositAmountCents,
        depositStatus: spaAppointments.depositStatus,
        orderId: spaAppointments.orderId,
        version: spaAppointments.version,
        createdAt: spaAppointments.createdAt,
        updatedAt: spaAppointments.updatedAt,
      })
      .from(spaAppointments)
      .leftJoin(spaProviders, eq(spaAppointments.providerId, spaProviders.id))
      .leftJoin(spaResources, eq(spaAppointments.resourceId, spaResources.id))
      .where(and(...conditions))
      .orderBy(desc(spaAppointments.startAt), desc(spaAppointments.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    if (sliced.length === 0) {
      return { items: [], cursor: null, hasMore: false };
    }

    // Batch-fetch appointment items for all returned appointments
    const appointmentIds = sliced.map((r) => r.id);
    const itemRows = await tx
      .select({
        id: spaAppointmentItems.id,
        appointmentId: spaAppointmentItems.appointmentId,
        serviceId: spaAppointmentItems.serviceId,
        serviceName: spaServices.name,
        addonId: spaAppointmentItems.addonId,
        providerId: spaAppointmentItems.providerId,
        providerName: spaProviders.displayName,
        startAt: spaAppointmentItems.startAt,
        endAt: spaAppointmentItems.endAt,
        priceCents: spaAppointmentItems.priceCents,
        finalPriceCents: spaAppointmentItems.finalPriceCents,
        discountAmountCents: spaAppointmentItems.discountAmountCents,
        status: spaAppointmentItems.status,
        sortOrder: spaAppointmentItems.sortOrder,
      })
      .from(spaAppointmentItems)
      .innerJoin(spaServices, eq(spaAppointmentItems.serviceId, spaServices.id))
      .leftJoin(spaProviders, eq(spaAppointmentItems.providerId, spaProviders.id))
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

    // Group items by appointment ID
    const itemsByAppointment = new Map<string, AppointmentServiceRow[]>();
    for (const item of itemRows) {
      const list = itemsByAppointment.get(item.appointmentId) ?? [];
      list.push({
        id: item.id,
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        addonId: item.addonId ?? null,
        providerId: item.providerId ?? null,
        providerName: item.providerName ?? null,
        startAt: item.startAt,
        endAt: item.endAt,
        priceCents: item.priceCents,
        finalPriceCents: item.finalPriceCents,
        discountAmountCents: item.discountAmountCents,
        status: item.status,
        sortOrder: item.sortOrder,
      });
      itemsByAppointment.set(item.appointmentId, list);
    }

    const items: AppointmentListRow[] = sliced.map((r) => ({
      id: r.id,
      appointmentNumber: r.appointmentNumber,
      customerId: r.customerId ?? null,
      guestName: r.guestName ?? null,
      guestEmail: r.guestEmail ?? null,
      guestPhone: r.guestPhone ?? null,
      locationId: r.locationId ?? null,
      providerId: r.providerId ?? null,
      providerName: r.providerName ?? null,
      providerColor: r.providerColor ?? null,
      resourceId: r.resourceId ?? null,
      resourceName: r.resourceName ?? null,
      startAt: r.startAt,
      endAt: r.endAt,
      status: r.status,
      bookingSource: r.bookingSource,
      notes: r.notes ?? null,
      depositAmountCents: r.depositAmountCents,
      depositStatus: r.depositStatus,
      orderId: r.orderId ?? null,
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      services: itemsByAppointment.get(r.id) ?? [],
    }));

    return {
      items,
      cursor: hasMore ? sliced[sliced.length - 1]!.id : null,
      hasMore,
    };
  });
}
