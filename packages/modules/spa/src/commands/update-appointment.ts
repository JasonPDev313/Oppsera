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
import { updateAppointmentSchema } from '../validation';
import type { UpdateAppointmentInput } from '../validation';

/**
 * Updates a spa appointment that is in scheduled or confirmed status.
 *
 * Supports updating provider, resource, time, notes, and service items.
 * Re-runs conflict detection if time or provider changes.
 * Uses optimistic locking via expectedVersion.
 */
export async function updateAppointment(ctx: RequestContext, input: UpdateAppointmentInput) {
  const parsed = updateAppointmentSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, undefined, 'updateAppointment');
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

    // Only allow updates in scheduled or confirmed status
    if (existing.status !== 'scheduled' && existing.status !== 'confirmed') {
      throw new AppError(
        'INVALID_STATUS',
        `Cannot update appointment in '${existing.status}' status. Only 'scheduled' or 'confirmed' appointments can be updated.`,
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

    // Determine updated values
    const newProviderId = parsed.providerId ?? existing.providerId;
    const newStartAt = parsed.startAt ? new Date(parsed.startAt) : existing.startAt;
    const newEndAt = parsed.endAt ? new Date(parsed.endAt) : existing.endAt;

    // Re-run conflict detection if time or provider changed
    const timeChanged = parsed.startAt || parsed.endAt;
    const providerChanged = parsed.providerId && parsed.providerId !== existing.providerId;

    if ((timeChanged || providerChanged) && newProviderId) {
      const conflicts = await detectConflicts({
        tenantId: ctx.tenantId,
        providerId: newProviderId,
        startTime: newStartAt,
        endTime: newEndAt,
        locationId: existing.locationId ?? undefined,
        customerId: existing.customerId ?? undefined,
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

    // Build changes for history tracking
    const changes: Record<string, unknown> = {};
    if (parsed.providerId !== undefined) changes.providerId = { from: existing.providerId, to: parsed.providerId };
    if (parsed.resourceId !== undefined) changes.resourceId = { from: existing.resourceId, to: parsed.resourceId };
    if (parsed.startAt !== undefined) changes.startAt = { from: existing.startAt.toISOString(), to: parsed.startAt };
    if (parsed.endAt !== undefined) changes.endAt = { from: existing.endAt.toISOString(), to: parsed.endAt };
    if (parsed.notes !== undefined) changes.notes = { from: existing.notes, to: parsed.notes };
    if (parsed.internalNotes !== undefined) changes.internalNotes = { from: existing.internalNotes, to: parsed.internalNotes };

    // Update appointment
    const [updated] = await tx
      .update(spaAppointments)
      .set({
        providerId: parsed.providerId ?? existing.providerId,
        resourceId: parsed.resourceId ?? existing.resourceId,
        startAt: newStartAt,
        endAt: newEndAt,
        notes: parsed.notes ?? existing.notes,
        internalNotes: parsed.internalNotes ?? existing.internalNotes,
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

    // Replace items if provided
    if (parsed.items && parsed.items.length > 0) {
      // Delete existing items
      await tx
        .delete(spaAppointmentItems)
        .where(
          and(
            eq(spaAppointmentItems.tenantId, ctx.tenantId),
            eq(spaAppointmentItems.appointmentId, parsed.id),
          ),
        );

      // Insert new items
      const itemValues = parsed.items.map((item, idx) => ({
        tenantId: ctx.tenantId,
        appointmentId: parsed.id,
        serviceId: item.serviceId,
        addonId: item.addonId ?? null,
        providerId: item.providerId ?? updated!.providerId ?? null,
        resourceId: item.resourceId ?? updated!.resourceId ?? null,
        startAt: new Date(item.startAt),
        endAt: new Date(item.endAt),
        priceCents: item.priceCents,
        memberPriceCents: item.memberPriceCents ?? null,
        finalPriceCents: item.finalPriceCents,
        discountAmountCents: item.discountAmountCents ?? 0,
        discountReason: item.discountReason ?? null,
        packageBalanceId: item.packageBalanceId ?? null,
        notes: item.notes ?? null,
        status: 'scheduled',
        sortOrder: idx,
      }));

      await tx.insert(spaAppointmentItems).values(itemValues);
      changes.items = 'replaced';
    }

    // Record history
    await tx.insert(spaAppointmentHistory).values({
      tenantId: ctx.tenantId,
      appointmentId: parsed.id,
      action: 'updated',
      oldStatus: existing.status,
      newStatus: existing.status,
      changes,
      performedBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_UPDATED, {
      appointmentId: updated!.id,
      appointmentNumber: updated!.appointmentNumber,
      changes,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.appointment.updated', 'spa_appointment', result.id);

  return result;
}
