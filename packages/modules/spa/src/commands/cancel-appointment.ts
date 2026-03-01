import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaAppointments, spaAppointmentItems, spaAppointmentHistory } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import { assertAppointmentTransition } from '../helpers/appointment-transitions';
import type { AppointmentStatus } from '../helpers/appointment-transitions';
import { cancelAppointmentSchema } from '../validation';
import type { CancelAppointmentInput } from '../validation';

/**
 * Cancels an appointment from scheduled, confirmed, or checked_in status.
 *
 * Optionally charges a cancellation fee based on deposit rules.
 * Updates all non-completed items to canceled status.
 * Records the cancellation reason, timestamp, and who canceled.
 */
export async function cancelAppointment(ctx: RequestContext, input: CancelAppointmentInput) {
  const parsed = cancelAppointmentSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaAppointments)
      .where(
        and(
          eq(spaAppointments.tenantId, ctx.tenantId),
          eq(spaAppointments.id, parsed.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Appointment not found: ${parsed.id}`, 404);
    }

    if (parsed.expectedVersion !== undefined && existing.version !== parsed.expectedVersion) {
      throw new AppError(
        'VERSION_CONFLICT',
        `Expected version ${parsed.expectedVersion} but found ${existing.version}`,
        409,
      );
    }

    // Validate state transition: scheduled/confirmed/checked_in → canceled
    assertAppointmentTransition(existing.status as AppointmentStatus, 'canceled');

    const now = new Date();

    // Determine if cancellation fee should apply
    const shouldChargeFee = parsed.chargeCancellationFee && !parsed.waiveFee;

    const [updated] = await tx
      .update(spaAppointments)
      .set({
        status: 'canceled',
        cancellationReason: parsed.reason ?? null,
        canceledAt: now,
        canceledBy: ctx.user.id,
        // If fee is being charged and there was a deposit, keep deposit captured
        // If waived, mark deposit for refund
        depositStatus: shouldChargeFee
          ? existing.depositStatus
          : existing.depositStatus === 'captured'
            ? 'refunded'
            : existing.depositStatus,
        version: existing.version + 1,
        updatedBy: ctx.user.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(spaAppointments.id, parsed.id),
          eq(spaAppointments.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    // Cancel all non-completed items
    await tx
      .update(spaAppointmentItems)
      .set({
        status: 'canceled',
        updatedAt: now,
      })
      .where(
        and(
          eq(spaAppointmentItems.tenantId, ctx.tenantId),
          eq(spaAppointmentItems.appointmentId, parsed.id),
        ),
      );

    await tx.insert(spaAppointmentHistory).values({
      tenantId: ctx.tenantId,
      appointmentId: parsed.id,
      action: 'canceled',
      oldStatus: existing.status,
      newStatus: 'canceled',
      changes: {
        reason: parsed.reason,
        chargeCancellationFee: shouldChargeFee,
        waiveFee: parsed.waiveFee,
      },
      reason: parsed.reason ?? null,
      performedBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_CANCELED, {
      appointmentId: updated!.id,
      appointmentNumber: updated!.appointmentNumber,
      customerId: updated!.customerId,
      providerId: updated!.providerId,
      locationId: updated!.locationId,
      canceledAt: now.toISOString(),
      canceledBy: ctx.user.id,
      reason: parsed.reason,
      previousStatus: existing.status,
      chargeCancellationFee: shouldChargeFee,
      depositAmountCents: existing.depositAmountCents,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.appointment.canceled', 'spa_appointment', result.id);

  return result;
}
