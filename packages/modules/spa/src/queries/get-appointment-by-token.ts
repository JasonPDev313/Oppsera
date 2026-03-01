import { eq, and } from 'drizzle-orm';
import {
  withTenant,
  spaAppointments,
  spaAppointmentItems,
  spaServices,
  spaProviders,
} from '@oppsera/db';

/**
 * Public-facing appointment details returned when looking up by appointment number.
 * Excludes internal-only fields (internalNotes, createdBy, updatedBy, etc.)
 * for safe exposure on guest-facing endpoints.
 */
export interface AppointmentByTokenResult {
  id: string;
  appointmentNumber: string;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  providerName: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
  notes: string | null;
  depositAmountCents: number;
  depositStatus: string;
  cancellationReason: string | null;
  canceledAt: Date | null;
  version: number;
  createdAt: Date;
  items: AppointmentTokenItemRow[];
}

export interface AppointmentTokenItemRow {
  id: string;
  serviceName: string;
  serviceCategory: string;
  durationMinutes: number;
  providerName: string | null;
  startAt: Date;
  endAt: Date;
  finalPriceCents: number;
  status: string;
}

/**
 * Look up an appointment by its appointmentNumber (used as public token)
 * within a specific tenant. Returns a guest-safe subset of fields.
 *
 * Returns null if not found.
 */
export async function getAppointmentByToken(input: {
  tenantId: string;
  token: string;
}): Promise<AppointmentByTokenResult | null> {
  return withTenant(input.tenantId, async (tx) => {
    const [appointment] = await tx
      .select({
        id: spaAppointments.id,
        appointmentNumber: spaAppointments.appointmentNumber,
        guestName: spaAppointments.guestName,
        guestEmail: spaAppointments.guestEmail,
        guestPhone: spaAppointments.guestPhone,
        providerId: spaAppointments.providerId,
        providerName: spaProviders.displayName,
        startAt: spaAppointments.startAt,
        endAt: spaAppointments.endAt,
        status: spaAppointments.status,
        notes: spaAppointments.notes,
        depositAmountCents: spaAppointments.depositAmountCents,
        depositStatus: spaAppointments.depositStatus,
        cancellationReason: spaAppointments.cancellationReason,
        canceledAt: spaAppointments.canceledAt,
        version: spaAppointments.version,
        createdAt: spaAppointments.createdAt,
      })
      .from(spaAppointments)
      .leftJoin(spaProviders, eq(spaAppointments.providerId, spaProviders.id))
      .where(
        and(
          eq(spaAppointments.tenantId, input.tenantId),
          eq(spaAppointments.appointmentNumber, input.token),
        ),
      )
      .limit(1);

    if (!appointment) {
      return null;
    }

    // Fetch appointment items with service + provider names
    const itemRows = await tx
      .select({
        id: spaAppointmentItems.id,
        serviceName: spaServices.name,
        serviceCategory: spaServices.category,
        durationMinutes: spaServices.durationMinutes,
        providerName: spaProviders.displayName,
        startAt: spaAppointmentItems.startAt,
        endAt: spaAppointmentItems.endAt,
        finalPriceCents: spaAppointmentItems.finalPriceCents,
        status: spaAppointmentItems.status,
      })
      .from(spaAppointmentItems)
      .innerJoin(spaServices, eq(spaAppointmentItems.serviceId, spaServices.id))
      .leftJoin(spaProviders, eq(spaAppointmentItems.providerId, spaProviders.id))
      .where(
        and(
          eq(spaAppointmentItems.tenantId, input.tenantId),
          eq(spaAppointmentItems.appointmentId, appointment.id),
        ),
      )
      .orderBy(spaAppointmentItems.sortOrder);

    const items: AppointmentTokenItemRow[] = itemRows.map((r) => ({
      id: r.id,
      serviceName: r.serviceName,
      serviceCategory: r.serviceCategory,
      durationMinutes: r.durationMinutes,
      providerName: r.providerName ?? null,
      startAt: r.startAt,
      endAt: r.endAt,
      finalPriceCents: r.finalPriceCents,
      status: r.status,
    }));

    return {
      id: appointment.id,
      appointmentNumber: appointment.appointmentNumber,
      guestName: appointment.guestName ?? null,
      guestEmail: appointment.guestEmail ?? null,
      guestPhone: appointment.guestPhone ?? null,
      providerName: appointment.providerName ?? null,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status,
      notes: appointment.notes ?? null,
      depositAmountCents: appointment.depositAmountCents,
      depositStatus: appointment.depositStatus,
      cancellationReason: appointment.cancellationReason ?? null,
      canceledAt: appointment.canceledAt ?? null,
      version: appointment.version,
      createdAt: appointment.createdAt,
      items,
    };
  });
}
