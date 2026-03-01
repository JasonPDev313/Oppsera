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

interface ConfirmAppointmentInput {
  id: string;
  expectedVersion?: number;
}

/**
 * Transitions an appointment from scheduled to confirmed.
 *
 * Uses the appointment state machine to validate the transition.
 */
export async function confirmAppointment(ctx: RequestContext, input: ConfirmAppointmentInput) {
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

    // Optimistic locking
    if (input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
      throw new AppError(
        'VERSION_CONFLICT',
        `Expected version ${input.expectedVersion} but found ${existing.version}`,
        409,
      );
    }

    // Validate state transition: scheduled → confirmed
    assertAppointmentTransition(existing.status as AppointmentStatus, 'confirmed');

    const [updated] = await tx
      .update(spaAppointments)
      .set({
        status: 'confirmed',
        version: existing.version + 1,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaAppointments.id, input.id),
          eq(spaAppointments.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    // Record history
    await tx.insert(spaAppointmentHistory).values({
      tenantId: ctx.tenantId,
      appointmentId: input.id,
      action: 'confirmed',
      oldStatus: existing.status,
      newStatus: 'confirmed',
      performedBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_CONFIRMED, {
      appointmentId: updated!.id,
      appointmentNumber: updated!.appointmentNumber,
      customerId: updated!.customerId,
      providerId: updated!.providerId,
      startAt: updated!.startAt.toISOString(),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.appointment.confirmed', 'spa_appointment', result.id);

  return result;
}
