import { eq, and, sql, ne } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaAppointments, spaAppointmentItems, spaAppointmentHistory } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';

interface RemoveAppointmentServiceInput {
  appointmentId: string;
  itemId: string;
  expectedVersion?: number;
}

/**
 * Removes a service item from an existing appointment.
 *
 * Only allowed for appointments in scheduled or confirmed status.
 * Cannot remove the last remaining item — an appointment must have
 * at least one service item.
 */
export async function removeAppointmentService(ctx: RequestContext, input: RemoveAppointmentServiceInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaAppointments)
      .where(
        and(
          eq(spaAppointments.tenantId, ctx.tenantId),
          eq(spaAppointments.id, input.appointmentId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Appointment not found: ${input.appointmentId}`, 404);
    }

    if (input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
      throw new AppError(
        'VERSION_CONFLICT',
        `Expected version ${input.expectedVersion} but found ${existing.version}`,
        409,
      );
    }

    // Only allow removing services in scheduled or confirmed status
    if (existing.status !== 'scheduled' && existing.status !== 'confirmed') {
      throw new AppError(
        'INVALID_STATUS',
        `Cannot remove services from appointment in '${existing.status}' status`,
        409,
      );
    }

    // Verify the item exists and belongs to this appointment
    const [itemToRemove] = await tx
      .select()
      .from(spaAppointmentItems)
      .where(
        and(
          eq(spaAppointmentItems.tenantId, ctx.tenantId),
          eq(spaAppointmentItems.appointmentId, input.appointmentId),
          eq(spaAppointmentItems.id, input.itemId),
        ),
      )
      .limit(1);

    if (!itemToRemove) {
      throw new AppError('NOT_FOUND', `Appointment item not found: ${input.itemId}`, 404);
    }

    // Count non-canceled items to ensure we don't remove the last one
    const [countResult] = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(spaAppointmentItems)
      .where(
        and(
          eq(spaAppointmentItems.tenantId, ctx.tenantId),
          eq(spaAppointmentItems.appointmentId, input.appointmentId),
          ne(spaAppointmentItems.status, 'canceled'),
        ),
      );

    if ((countResult?.count ?? 0) <= 1) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Cannot remove the last service item. Cancel the appointment instead.',
        400,
      );
    }

    const now = new Date();

    // Mark the item as canceled (soft delete)
    await tx
      .update(spaAppointmentItems)
      .set({
        status: 'canceled',
        updatedAt: now,
      })
      .where(eq(spaAppointmentItems.id, input.itemId));

    // Recalculate appointment end time from remaining active items
    const [maxEnd] = await tx
      .select({ maxEndAt: sql<Date>`MAX(end_at)` })
      .from(spaAppointmentItems)
      .where(
        and(
          eq(spaAppointmentItems.tenantId, ctx.tenantId),
          eq(spaAppointmentItems.appointmentId, input.appointmentId),
          ne(spaAppointmentItems.status, 'canceled'),
        ),
      );

    const updateFields: Record<string, unknown> = {
      version: existing.version + 1,
      updatedBy: ctx.user.id,
      updatedAt: now,
    };

    // Shrink appointment end time if the removed item was the last one
    if (maxEnd?.maxEndAt && new Date(maxEnd.maxEndAt) < existing.endAt) {
      updateFields.endAt = new Date(maxEnd.maxEndAt);
    }

    const [updated] = await tx
      .update(spaAppointments)
      .set(updateFields)
      .where(
        and(
          eq(spaAppointments.id, input.appointmentId),
          eq(spaAppointments.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    await tx.insert(spaAppointmentHistory).values({
      tenantId: ctx.tenantId,
      appointmentId: input.appointmentId,
      action: 'service_removed',
      oldStatus: existing.status,
      newStatus: existing.status,
      changes: {
        removedItemId: input.itemId,
        serviceId: itemToRemove.serviceId,
        addonId: itemToRemove.addonId,
        priceCents: itemToRemove.finalPriceCents,
      },
      performedBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_UPDATED, {
      appointmentId: updated!.id,
      appointmentNumber: updated!.appointmentNumber,
      customerId: updated!.customerId,
      providerId: updated!.providerId,
      action: 'service_removed',
      removedItemId: input.itemId,
      serviceId: itemToRemove.serviceId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.appointment.service_removed', 'spa_appointment', result.id);

  return result;
}
