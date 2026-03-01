import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaAppointments, spaAppointmentItems, spaAppointmentHistory } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import { assertAppointmentTransition } from '../helpers/appointment-transitions';
import type { AppointmentStatus } from '../helpers/appointment-transitions';
import { AppError } from '@oppsera/shared';

interface NoShowAppointmentInput {
  id: string;
  expectedVersion?: number;
  chargeNoShowFee?: boolean;
  notes?: string;
}

/**
 * Marks an appointment as no-show.
 *
 * Valid transitions: scheduled → no_show, confirmed → no_show.
 * Optionally charges a no-show fee (flagged on the appointment).
 * Cancels all scheduled items.
 */
export async function noShowAppointment(ctx: RequestContext, input: NoShowAppointmentInput) {
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

    // Validate state transition: scheduled/confirmed → no_show
    assertAppointmentTransition(existing.status as AppointmentStatus, 'no_show');

    const now = new Date();

    const [updated] = await tx
      .update(spaAppointments)
      .set({
        status: 'no_show',
        noShowFeeCharged: input.chargeNoShowFee ?? false,
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

    // Cancel all scheduled items
    await tx
      .update(spaAppointmentItems)
      .set({
        status: 'canceled',
        updatedAt: now,
      })
      .where(
        and(
          eq(spaAppointmentItems.tenantId, ctx.tenantId),
          eq(spaAppointmentItems.appointmentId, input.id),
          eq(spaAppointmentItems.status, 'scheduled'),
        ),
      );

    await tx.insert(spaAppointmentHistory).values({
      tenantId: ctx.tenantId,
      appointmentId: input.id,
      action: 'no_show',
      oldStatus: existing.status,
      newStatus: 'no_show',
      changes: {
        chargeNoShowFee: input.chargeNoShowFee ?? false,
        notes: input.notes,
      },
      reason: input.notes ?? null,
      performedBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_NO_SHOW, {
      appointmentId: updated!.id,
      appointmentNumber: updated!.appointmentNumber,
      customerId: updated!.customerId,
      providerId: updated!.providerId,
      locationId: updated!.locationId,
      previousStatus: existing.status,
      chargeNoShowFee: input.chargeNoShowFee ?? false,
      depositAmountCents: existing.depositAmountCents,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.appointment.no_show', 'spa_appointment', result.id);

  return result;
}
