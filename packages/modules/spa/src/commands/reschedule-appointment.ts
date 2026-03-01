import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { checkIdempotency } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaAppointments, spaAppointmentItems, spaAppointmentHistory } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import { detectConflicts } from '../helpers/conflict-detector';
import { rescheduleAppointmentSchema } from '../validation';
import type { RescheduleAppointmentInput } from '../validation';

/**
 * Reschedules an appointment to a new time/date, optionally changing provider/resource.
 *
 * Only allowed for appointments in scheduled or confirmed status.
 * Re-runs full conflict detection for the new time slot.
 * Updates all appointment items' times proportionally.
 */
export async function rescheduleAppointment(ctx: RequestContext, input: RescheduleAppointmentInput) {
  const parsed = rescheduleAppointmentSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, undefined, 'rescheduleAppointment');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Fetch existing appointment
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

    // Only allow reschedule in scheduled or confirmed status
    if (existing.status !== 'scheduled' && existing.status !== 'confirmed') {
      throw new AppError(
        'INVALID_STATUS',
        `Cannot reschedule appointment in '${existing.status}' status`,
        409,
      );
    }

    // Optimistic locking
    if (parsed.expectedVersion !== undefined && existing.version !== parsed.expectedVersion) {
      throw new AppError(
        'VERSION_CONFLICT',
        `Expected version ${parsed.expectedVersion} but found ${existing.version}`,
        409,
      );
    }

    const newStartAt = new Date(parsed.newStartAt);
    const newEndAt = new Date(parsed.newEndAt);
    const newProviderId = parsed.newProviderId ?? existing.providerId;
    const newResourceId = parsed.newResourceId ?? existing.resourceId;

    // Run conflict detection for new time slot
    if (newProviderId) {
      const resourceIds: string[] = [];
      if (newResourceId) resourceIds.push(newResourceId);

      const conflicts = await detectConflicts({
        tenantId: ctx.tenantId,
        providerId: newProviderId,
        startTime: newStartAt,
        endTime: newEndAt,
        locationId: existing.locationId ?? undefined,
        customerId: existing.customerId ?? undefined,
        resourceIds,
        excludeAppointmentId: parsed.id,
      });

      if (conflicts.hasConflicts) {
        throw new AppError(
          'SCHEDULING_CONFLICT',
          `Scheduling conflicts detected: ${conflicts.conflicts.map((c) => c.description).join('; ')}`,
          409,
        );
      }
    }

    // Calculate time offset for shifting items
    const oldStartMs = existing.startAt.getTime();
    const offsetMs = newStartAt.getTime() - oldStartMs;

    // Update the appointment
    const [updated] = await tx
      .update(spaAppointments)
      .set({
        startAt: newStartAt,
        endAt: newEndAt,
        providerId: newProviderId,
        resourceId: newResourceId,
        version: existing.version + 1,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaAppointments.id, parsed.id),
          eq(spaAppointments.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    // Shift all item times by the same offset
    const items = await tx
      .select()
      .from(spaAppointmentItems)
      .where(
        and(
          eq(spaAppointmentItems.tenantId, ctx.tenantId),
          eq(spaAppointmentItems.appointmentId, parsed.id),
        ),
      );

    for (const item of items) {
      const itemNewStart = new Date(item.startAt.getTime() + offsetMs);
      const itemNewEnd = new Date(item.endAt.getTime() + offsetMs);

      await tx
        .update(spaAppointmentItems)
        .set({
          startAt: itemNewStart,
          endAt: itemNewEnd,
          providerId: parsed.newProviderId ?? item.providerId,
          resourceId: parsed.newResourceId ?? item.resourceId,
          updatedAt: new Date(),
        })
        .where(eq(spaAppointmentItems.id, item.id));
    }

    // Record history
    await tx.insert(spaAppointmentHistory).values({
      tenantId: ctx.tenantId,
      appointmentId: parsed.id,
      action: 'rescheduled',
      oldStatus: existing.status,
      newStatus: existing.status,
      changes: {
        startAt: { from: existing.startAt.toISOString(), to: parsed.newStartAt },
        endAt: { from: existing.endAt.toISOString(), to: parsed.newEndAt },
        providerId: parsed.newProviderId ? { from: existing.providerId, to: parsed.newProviderId } : undefined,
        resourceId: parsed.newResourceId ? { from: existing.resourceId, to: parsed.newResourceId } : undefined,
      },
      reason: parsed.reason ?? null,
      performedBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_RESCHEDULED, {
      appointmentId: updated!.id,
      appointmentNumber: updated!.appointmentNumber,
      previousStartAt: existing.startAt.toISOString(),
      previousEndAt: existing.endAt.toISOString(),
      newStartAt: parsed.newStartAt,
      newEndAt: parsed.newEndAt,
      newProviderId: parsed.newProviderId,
      reason: parsed.reason,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.appointment.rescheduled', 'spa_appointment', result.id);

  return result;
}
