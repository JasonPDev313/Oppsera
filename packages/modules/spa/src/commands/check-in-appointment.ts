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

interface CheckInAppointmentInput {
  id: string;
  expectedVersion?: number;
}

/**
 * Checks in a guest for their appointment.
 *
 * Valid transitions: scheduled → checked_in, confirmed → checked_in.
 * Records the check-in timestamp and the user who performed the check-in.
 */
export async function checkInAppointment(ctx: RequestContext, input: CheckInAppointmentInput) {
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

    // Validate state transition: scheduled/confirmed → checked_in
    assertAppointmentTransition(existing.status as AppointmentStatus, 'checked_in');

    const now = new Date();

    const [updated] = await tx
      .update(spaAppointments)
      .set({
        status: 'checked_in',
        checkedInAt: now,
        checkedInBy: ctx.user.id,
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
      action: 'checked_in',
      oldStatus: existing.status,
      newStatus: 'checked_in',
      performedBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_CHECKED_IN, {
      appointmentId: updated!.id,
      appointmentNumber: updated!.appointmentNumber,
      customerId: updated!.customerId,
      providerId: updated!.providerId,
      checkedInAt: now.toISOString(),
      checkedInBy: ctx.user.id,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.appointment.checked_in', 'spa_appointment', result.id);

  return result;
}
