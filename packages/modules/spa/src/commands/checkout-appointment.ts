import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaAppointments, spaAppointmentHistory } from '@oppsera/db';
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
        ),
      )
      .returning();

    await tx.insert(spaAppointmentHistory).values({
      tenantId: ctx.tenantId,
      appointmentId: input.id,
      action: 'checked_out',
      oldStatus: existing.status,
      newStatus: 'checked_out',
      performedBy: ctx.user.id,
    });

    const events = [
      buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_CHECKED_OUT, {
        appointmentId: updated!.id,
        appointmentNumber: updated!.appointmentNumber,
        customerId: updated!.customerId,
        providerId: updated!.providerId,
        checkedOutAt: now.toISOString(),
        orderId: updated!.orderId ?? null,
        locationId: updated!.locationId ?? null,
      }),
      buildEventFromContext(ctx, SPA_EVENTS.CHECKOUT_READY, {
        appointmentId: updated!.id,
        appointmentNumber: updated!.appointmentNumber,
        customerId: updated!.customerId,
        locationId: updated!.locationId,
        orderId: updated!.orderId,
        pmsFolioId: updated!.pmsFolioId,
      }),
    ];

    return { result: updated!, events };
  });

  await auditLog(ctx, 'spa.appointment.checked_out', 'spa_appointment', result.id);

  return result;
}
