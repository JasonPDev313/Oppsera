import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaAppointments, spaAppointmentItems, spaAppointmentHistory, spaProviders, spaResources } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import { detectConflicts } from '../helpers/conflict-detector';
import { createAppointmentSchema } from '../validation';
import type { CreateAppointmentInput } from '../validation';

/**
 * Creates a new spa appointment with one or more service items.
 *
 * Validates provider/resource existence, runs conflict detection,
 * generates an appointment number, and inserts the appointment
 * with all items in a single transaction.
 */
export async function createAppointment(ctx: RequestContext, input: CreateAppointmentInput) {
  const parsed = createAppointmentSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, parsed.clientRequestId, 'createAppointment');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Validate provider exists if specified at appointment level
    if (parsed.providerId) {
      const [provider] = await tx
        .select({ id: spaProviders.id, isActive: spaProviders.isActive })
        .from(spaProviders)
        .where(
          and(
            eq(spaProviders.tenantId, ctx.tenantId),
            eq(spaProviders.id, parsed.providerId),
          ),
        )
        .limit(1);

      if (!provider) {
        throw new AppError('NOT_FOUND', `Provider not found: ${parsed.providerId}`, 404);
      }
      if (!provider.isActive) {
        throw new AppError('VALIDATION_ERROR', 'Provider is not active', 400);
      }
    }

    // Validate resource exists if specified at appointment level
    if (parsed.resourceId) {
      const [resource] = await tx
        .select({ id: spaResources.id, isActive: spaResources.isActive })
        .from(spaResources)
        .where(
          and(
            eq(spaResources.tenantId, ctx.tenantId),
            eq(spaResources.id, parsed.resourceId),
          ),
        )
        .limit(1);

      if (!resource) {
        throw new AppError('NOT_FOUND', `Resource not found: ${parsed.resourceId}`, 404);
      }
      if (!resource.isActive) {
        throw new AppError('VALIDATION_ERROR', 'Resource is not active', 400);
      }
    }

    // Run conflict detection for each item's provider
    const startTime = new Date(parsed.startAt);
    const endTime = new Date(parsed.endAt);

    // Collect unique resource IDs from items
    const itemResourceIds = parsed.items
      .map((item) => item.resourceId)
      .filter((id): id is string => !!id);

    // Use appointment-level provider for conflict check, or fall back to first item's provider
    const primaryProviderId = parsed.providerId ?? parsed.items[0]?.providerId;

    if (primaryProviderId) {
      const conflicts = await detectConflicts({
        tenantId: ctx.tenantId,
        providerId: primaryProviderId,
        startTime,
        endTime,
        locationId: parsed.locationId,
        customerId: parsed.customerId,
        resourceIds: parsed.resourceId
          ? [parsed.resourceId, ...itemResourceIds]
          : itemResourceIds,
      });

      if (conflicts.hasConflicts) {
        throw new AppError(
          'SCHEDULING_CONFLICT',
          `Scheduling conflicts detected: ${conflicts.conflicts.map((c) => c.description).join('; ')}`,
          409,
        );
      }
    }

    // Generate appointment number: SPA-YYYYMMDD-XXXX
    const dateStr = startTime.toISOString().slice(0, 10).replace(/-/g, '');
    const [counterRow] = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(spaAppointments)
      .where(eq(spaAppointments.tenantId, ctx.tenantId));

    const seqNum = ((counterRow?.count ?? 0) + 1).toString().padStart(4, '0');
    const appointmentNumber = `SPA-${dateStr}-${seqNum}`;

    // Insert appointment
    const [created] = await tx
      .insert(spaAppointments)
      .values({
        tenantId: ctx.tenantId,
        appointmentNumber,
        customerId: parsed.customerId ?? null,
        guestName: parsed.guestName ?? null,
        guestEmail: parsed.guestEmail ?? null,
        guestPhone: parsed.guestPhone ?? null,
        locationId: parsed.locationId,
        providerId: parsed.providerId ?? null,
        resourceId: parsed.resourceId ?? null,
        startAt: startTime,
        endAt: endTime,
        status: 'scheduled',
        bookingSource: parsed.bookingSource,
        bookingChannel: parsed.bookingChannel ?? null,
        notes: parsed.notes ?? null,
        internalNotes: parsed.internalNotes ?? null,
        recurrenceRule: parsed.recurrenceRule ?? null,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      })
      .returning();

    // Insert appointment items
    const itemValues = parsed.items.map((item, idx) => ({
      tenantId: ctx.tenantId,
      appointmentId: created!.id,
      serviceId: item.serviceId,
      addonId: item.addonId ?? null,
      providerId: item.providerId ?? parsed.providerId ?? null,
      resourceId: item.resourceId ?? parsed.resourceId ?? null,
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

    const insertedItems = await tx
      .insert(spaAppointmentItems)
      .values(itemValues)
      .returning();

    // Record history
    await tx.insert(spaAppointmentHistory).values({
      tenantId: ctx.tenantId,
      appointmentId: created!.id,
      action: 'created',
      newStatus: 'scheduled',
      performedBy: ctx.user.id,
    });

    // Save idempotency key
    await saveIdempotencyKey(tx, ctx.tenantId, parsed.clientRequestId, 'createAppointment', created!);

    const event = buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_CREATED, {
      appointmentId: created!.id,
      appointmentNumber,
      customerId: parsed.customerId,
      providerId: parsed.providerId,
      locationId: parsed.locationId,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      bookingSource: parsed.bookingSource,
      itemCount: insertedItems.length,
    });

    return { result: { ...created!, items: insertedItems }, events: [event] };
  });

  await auditLog(ctx, 'spa.appointment.created', 'spa_appointment', result.id);

  return result;
}
