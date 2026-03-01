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

interface StartServiceInput {
  id: string;
  expectedVersion?: number;
}

/**
 * Transitions an appointment from checked_in to in_service.
 *
 * Records the service start timestamp and updates all service items
 * to in_progress status.
 */
export async function startService(ctx: RequestContext, input: StartServiceInput) {
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

    // Validate state transition: checked_in → in_service
    assertAppointmentTransition(existing.status as AppointmentStatus, 'in_service');

    const now = new Date();

    const [updated] = await tx
      .update(spaAppointments)
      .set({
        status: 'in_service',
        serviceStartedAt: now,
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

    // Update all scheduled items to in_progress
    await tx
      .update(spaAppointmentItems)
      .set({
        status: 'in_progress',
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
      action: 'service_started',
      oldStatus: existing.status,
      newStatus: 'in_service',
      performedBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_SERVICE_STARTED, {
      appointmentId: updated!.id,
      appointmentNumber: updated!.appointmentNumber,
      customerId: updated!.customerId,
      providerId: updated!.providerId,
      serviceStartedAt: now.toISOString(),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.appointment.service_started', 'spa_appointment', result.id);

  return result;
}
