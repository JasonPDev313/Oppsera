import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaAppointments, spaAppointmentItems, spaAppointmentHistory, spaServices } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import { assertAppointmentTransition } from '../helpers/appointment-transitions';
import type { AppointmentStatus } from '../helpers/appointment-transitions';
import { AppError } from '@oppsera/shared';

interface CheckoutAppointmentInput {
  id: string;
  expectedVersion?: number;
  orderId?: string;
  pmsFolioId?: string;
}

/**
 * Transitions an appointment from completed to checked_out.
 *
 * Records the checkout timestamp and optionally links to an order or PMS folio.
 * Also emits a CHECKOUT_READY event for downstream payment processing.
 */
export async function checkoutAppointment(ctx: RequestContext, input: CheckoutAppointmentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaAppointments)
      .where(
        and(
          eq(spaAppointments.tenantId, ctx.tenantId),
          eq(spaAppointments.id, input.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Appointment not found: ${input.id}`, 404);
    }

    if (input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
      throw new AppError(
        'VERSION_CONFLICT',
        `Expected version ${input.expectedVersion} but found ${existing.version}`,
        409,
      );
    }

    // Validate state transition: completed → checked_out
    assertAppointmentTransition(existing.status as AppointmentStatus, 'checked_out');

    const now = new Date();

    const [updated] = await tx
      .update(spaAppointments)
      .set({
        status: 'checked_out',
        checkedOutAt: now,
        orderId: input.orderId ?? existing.orderId,
        pmsFolioId: input.pmsFolioId ?? existing.pmsFolioId,
        version: existing.version + 1,
        updatedBy: ctx.user.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(spaAppointments.id, input.id),
          eq(spaAppointments.tenantId, ctx.tenantId),
          eq(spaAppointments.version, existing.version),
        ),
      )
      .returning();

    if (!updated) {
      throw new AppError(
        'VERSION_CONFLICT',
        'Appointment was modified by another session. Please refresh and retry.',
        409,
      );
    }

    await tx.insert(spaAppointmentHistory).values({
      tenantId: ctx.tenantId,
      appointmentId: input.id,
      action: 'checked_out',
      oldStatus: existing.status,
      newStatus: 'checked_out',
      performedBy: ctx.user.id,
    });

    // Fetch appointment items joined with services for financial data needed by GL adapter
    const items = await tx
      .select({
        serviceId: spaAppointmentItems.serviceId,
        finalPriceCents: spaAppointmentItems.finalPriceCents,
        providerId: spaAppointmentItems.providerId,
        serviceName: spaServices.name,
      })
      .from(spaAppointmentItems)
      .innerJoin(spaServices, eq(spaAppointmentItems.serviceId, spaServices.id))
      .where(
        and(
          eq(spaAppointmentItems.tenantId, ctx.tenantId),
          eq(spaAppointmentItems.appointmentId, input.id),
        ),
      );

    const totalCents = items.reduce((sum, i) => sum + i.finalPriceCents, 0);
    const taxCents = 0; // Tax calculated at payment time, not appointment level
    const tipCents = 0; // Tips added at payment time

    const serviceItems = items.map((i) => ({
      serviceId: i.serviceId,
      serviceName: i.serviceName,
      priceCents: i.finalPriceCents,
      providerId: i.providerId,
    }));

    // Determine isNewClient: customer has no prior completed/checked_out appointments
    let isNewClient = false;
    if (updated.customerId) {
      const priorRows = await (tx as any).execute(sql`
        SELECT 1 FROM spa_appointments
        WHERE tenant_id = ${ctx.tenantId}
          AND customer_id = ${updated.customerId}
          AND id != ${updated.id}
          AND status IN ('completed', 'checked_out')
        LIMIT 1
      `);
      const prior = Array.from(priorRows as Iterable<unknown>);
      isNewClient = prior.length === 0;
    }

    // Determine didRebook: customer has a future appointment at this location
    let didRebook = false;
    if (updated.customerId) {
      const futureRows = await (tx as any).execute(sql`
        SELECT 1 FROM spa_appointments
        WHERE tenant_id = ${ctx.tenantId}
          AND customer_id = ${updated.customerId}
          AND id != ${updated.id}
          AND start_at > ${now}
          AND status NOT IN ('canceled', 'no_show')
        LIMIT 1
      `);
      const future = Array.from(futureRows as Iterable<unknown>);
      didRebook = future.length > 0;
    }

    const events = [
      buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_CHECKED_OUT, {
        appointmentId: updated.id,
        appointmentNumber: updated.appointmentNumber,
        customerId: updated.customerId,
        providerId: updated.providerId,
        checkedOutAt: now.toISOString(),
        orderId: updated.orderId ?? null,
        locationId: updated.locationId ?? null,
        // Financial fields required by spa-posting-adapter
        totalCents,
        taxCents,
        tipCents,
        retailCents: 0, // Retail products are sold via POS order, not appointment items
        isNewClient,
        didRebook,
        serviceItems,
        businessDate: now.toISOString().slice(0, 10),
      }),
      buildEventFromContext(ctx, SPA_EVENTS.CHECKOUT_READY, {
        appointmentId: updated.id,
        appointmentNumber: updated.appointmentNumber,
        customerId: updated.customerId,
        locationId: updated.locationId,
        orderId: updated.orderId,
        pmsFolioId: updated.pmsFolioId,
      }),
    ];

    return { result: updated, events };
  });

  auditLogDeferred(ctx, 'spa.appointment.checked_out', 'spa_appointment', result.id);

  return result;
}
