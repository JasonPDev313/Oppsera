import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaAppointments, spaAppointmentItems, spaAppointmentHistory } from '@oppsera/db';
import { canTransitionAppointment, getEventTypeForTransition } from '../helpers/appointment-transitions';
import type { AppointmentStatus } from '../helpers/appointment-transitions';

interface BulkUpdateAppointmentsInput {
  /** Appointment IDs to update */
  ids: string[];
  /** Target status to transition all appointments to */
  targetStatus: AppointmentStatus;
  /** Optional reason for the bulk update */
  reason?: string;
}

interface BulkUpdateResult {
  updated: Array<{ id: string; appointmentNumber: string; previousStatus: string }>;
  skipped: Array<{ id: string; appointmentNumber: string; reason: string }>;
  totalUpdated: number;
  totalSkipped: number;
}

/**
 * Performs a bulk status update on multiple appointments.
 *
 * Each appointment is individually validated against the state machine.
 * Appointments that cannot transition to the target status are skipped
 * and reported in the result. This is a best-effort operation.
 *
 * Maximum 50 appointments per bulk update.
 */
export async function bulkUpdateAppointments(ctx: RequestContext, input: BulkUpdateAppointmentsInput) {
  if (input.ids.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'At least one appointment ID is required', 400);
  }
  if (input.ids.length > 50) {
    throw new AppError('VALIDATION_ERROR', 'Maximum 50 appointments per bulk update', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch all appointments in a single query
    const appointments = await tx
      .select()
      .from(spaAppointments)
      .where(
        and(
          eq(spaAppointments.tenantId, ctx.tenantId),
          inArray(spaAppointments.id, input.ids),
        ),
      );

    // Build a lookup map
    const appointmentMap = new Map(appointments.map((a) => [a.id, a]));

    const updated: BulkUpdateResult['updated'] = [];
    const skipped: BulkUpdateResult['skipped'] = [];
    const events: Array<ReturnType<typeof buildEventFromContext>> = [];

    const now = new Date();

    for (const id of input.ids) {
      const existing = appointmentMap.get(id);

      // Check if appointment exists
      if (!existing) {
        skipped.push({ id, appointmentNumber: 'unknown', reason: 'Appointment not found' });
        continue;
      }

      // Check if transition is valid
      const currentStatus = existing.status as AppointmentStatus;
      if (!canTransitionAppointment(currentStatus, input.targetStatus)) {
        skipped.push({
          id,
          appointmentNumber: existing.appointmentNumber,
          reason: `Cannot transition from '${currentStatus}' to '${input.targetStatus}'`,
        });
        continue;
      }

      // Build the update fields based on target status
      const updateFields: Record<string, unknown> = {
        status: input.targetStatus,
        version: existing.version + 1,
        updatedBy: ctx.user.id,
        updatedAt: now,
      };

      // Set status-specific fields
      switch (input.targetStatus) {
        case 'canceled':
          updateFields.cancellationReason = input.reason ?? null;
          updateFields.canceledAt = now;
          updateFields.canceledBy = ctx.user.id;
          break;
        case 'checked_in':
          updateFields.checkedInAt = now;
          updateFields.checkedInBy = ctx.user.id;
          break;
        case 'in_service':
          updateFields.serviceStartedAt = now;
          break;
        case 'completed':
          updateFields.serviceCompletedAt = now;
          break;
        case 'checked_out':
          updateFields.checkedOutAt = now;
          break;
      }

      // Update the appointment
      await tx
        .update(spaAppointments)
        .set(updateFields)
        .where(
          and(
            eq(spaAppointments.id, id),
            eq(spaAppointments.tenantId, ctx.tenantId),
          ),
        );

      // Update item statuses for specific transitions
      if (input.targetStatus === 'canceled' || input.targetStatus === 'no_show') {
        await tx
          .update(spaAppointmentItems)
          .set({ status: 'canceled', updatedAt: now })
          .where(
            and(
              eq(spaAppointmentItems.tenantId, ctx.tenantId),
              eq(spaAppointmentItems.appointmentId, id),
            ),
          );
      } else if (input.targetStatus === 'in_service') {
        await tx
          .update(spaAppointmentItems)
          .set({ status: 'in_progress', updatedAt: now })
          .where(
            and(
              eq(spaAppointmentItems.tenantId, ctx.tenantId),
              eq(spaAppointmentItems.appointmentId, id),
              eq(spaAppointmentItems.status, 'scheduled'),
            ),
          );
      } else if (input.targetStatus === 'completed') {
        await tx
          .update(spaAppointmentItems)
          .set({ status: 'completed', updatedAt: now })
          .where(
            and(
              eq(spaAppointmentItems.tenantId, ctx.tenantId),
              eq(spaAppointmentItems.appointmentId, id),
              eq(spaAppointmentItems.status, 'in_progress'),
            ),
          );
      }

      // Record history
      await tx.insert(spaAppointmentHistory).values({
        tenantId: ctx.tenantId,
        appointmentId: id,
        action: `bulk_${input.targetStatus}`,
        oldStatus: currentStatus,
        newStatus: input.targetStatus,
        reason: input.reason ?? null,
        performedBy: ctx.user.id,
      });

      updated.push({
        id,
        appointmentNumber: existing.appointmentNumber,
        previousStatus: currentStatus,
      });

      // Emit event for the transition
      const eventType = getEventTypeForTransition(input.targetStatus);
      if (eventType) {
        events.push(
          buildEventFromContext(ctx, eventType, {
            appointmentId: id,
            appointmentNumber: existing.appointmentNumber,
            customerId: existing.customerId,
            providerId: existing.providerId,
            locationId: existing.locationId,
            previousStatus: currentStatus,
            isBulkUpdate: true,
          }),
        );
      }
    }

    const bulkResult: BulkUpdateResult = {
      updated,
      skipped,
      totalUpdated: updated.length,
      totalSkipped: skipped.length,
    };

    return { result: bulkResult, events };
  });

  await auditLog(
    ctx,
    `spa.appointment.bulk_${input.targetStatus}`,
    'spa_appointment_bulk',
    `${result.totalUpdated} updated, ${result.totalSkipped} skipped`,
  );

  return result;
}
