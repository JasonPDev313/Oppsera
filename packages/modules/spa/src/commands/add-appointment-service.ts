import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaAppointments, spaAppointmentItems, spaAppointmentHistory } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import { detectConflicts } from '../helpers/conflict-detector';
import { appointmentItemSchema } from '../validation';
import type { AppointmentItemInput } from '../validation';

interface AddAppointmentServiceInput {
  appointmentId: string;
  expectedVersion?: number;
  item: AppointmentItemInput;
}

/**
 * Adds a service item to an existing appointment.
 *
 * Only allowed for appointments in scheduled or confirmed status.
 * Validates the new item's provider/resource availability via conflict detection.
 * Updates the appointment's end time if the new item extends it.
 */
export async function addAppointmentService(ctx: RequestContext, input: AddAppointmentServiceInput) {
  const parsedItem = appointmentItemSchema.parse(input.item);

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

    // Only allow adding services in scheduled or confirmed status
    if (existing.status !== 'scheduled' && existing.status !== 'confirmed') {
      throw new AppError(
        'INVALID_STATUS',
        `Cannot add services to appointment in '${existing.status}' status`,
        409,
      );
    }

    const itemStartTime = new Date(parsedItem.startAt);
    const itemEndTime = new Date(parsedItem.endAt);

    // Run conflict detection for the new item's provider
    const itemProviderId = parsedItem.providerId ?? existing.providerId;
    if (itemProviderId) {
      const resourceIds: string[] = [];
      if (parsedItem.resourceId) resourceIds.push(parsedItem.resourceId);

      const conflicts = await detectConflicts({
        tenantId: ctx.tenantId,
        providerId: itemProviderId,
        startTime: itemStartTime,
        endTime: itemEndTime,
        locationId: existing.locationId ?? undefined,
        customerId: existing.customerId ?? undefined,
        resourceIds,
        excludeAppointmentId: input.appointmentId,
      });

      if (conflicts.hasConflicts) {
        throw new AppError(
          'SCHEDULING_CONFLICT',
          `Scheduling conflicts detected: ${conflicts.conflicts.map((c) => c.description).join('; ')}`,
          409,
        );
      }
    }

    // Get max sort order for existing items
    const [maxSort] = await tx
      .select({ maxOrder: sql<number>`COALESCE(MAX(sort_order), -1)` })
      .from(spaAppointmentItems)
      .where(
        and(
          eq(spaAppointmentItems.tenantId, ctx.tenantId),
          eq(spaAppointmentItems.appointmentId, input.appointmentId),
        ),
      );

    const now = new Date();

    // Insert the new item
    const [newItem] = await tx
      .insert(spaAppointmentItems)
      .values({
        tenantId: ctx.tenantId,
        appointmentId: input.appointmentId,
        serviceId: parsedItem.serviceId,
        addonId: parsedItem.addonId ?? null,
        providerId: parsedItem.providerId ?? existing.providerId,
        resourceId: parsedItem.resourceId ?? existing.resourceId,
        startAt: itemStartTime,
        endAt: itemEndTime,
        priceCents: parsedItem.priceCents,
        memberPriceCents: parsedItem.memberPriceCents ?? null,
        finalPriceCents: parsedItem.finalPriceCents,
        discountAmountCents: parsedItem.discountAmountCents ?? 0,
        discountReason: parsedItem.discountReason ?? null,
        packageBalanceId: parsedItem.packageBalanceId ?? null,
        notes: parsedItem.notes ?? null,
        status: 'scheduled',
        sortOrder: (maxSort?.maxOrder ?? -1) + 1,
      })
      .returning();

    // Extend appointment end time if the new item goes beyond it
    const updateFields: Record<string, unknown> = {
      version: existing.version + 1,
      updatedBy: ctx.user.id,
      updatedAt: now,
    };

    if (itemEndTime > existing.endAt) {
      updateFields.endAt = itemEndTime;
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
      action: 'service_added',
      oldStatus: existing.status,
      newStatus: existing.status,
      changes: {
        addedItemId: newItem!.id,
        serviceId: parsedItem.serviceId,
        addonId: parsedItem.addonId,
        priceCents: parsedItem.finalPriceCents,
      },
      performedBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_UPDATED, {
      appointmentId: updated!.id,
      appointmentNumber: updated!.appointmentNumber,
      customerId: updated!.customerId,
      providerId: updated!.providerId,
      action: 'service_added',
      addedItemId: newItem!.id,
      serviceId: parsedItem.serviceId,
    });

    return { result: { ...updated!, addedItem: newItem! }, events: [event] };
  });

  await auditLog(ctx, 'spa.appointment.service_added', 'spa_appointment', result.id);

  return result;
}
