import { sql, and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsReservations, pmsRoomTypes, pmsProperties } from '@oppsera/db';
import type { UpdateReservationInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { ConcurrencyConflictError } from '../errors';

/**
 * Update reservation details (PATCH semantics).
 * Can update: guestId, primaryGuestJson, adults, children, nightlyRateCents, ratePlanId, notes.
 * Cannot update: dates, room, status (use dedicated commands).
 * Requires version for optimistic locking.
 */
export async function updateReservation(
  ctx: RequestContext,
  reservationId: string,
  input: UpdateReservationInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load current reservation
    const [current] = await tx
      .select()
      .from(pmsReservations)
      .where(
        and(eq(pmsReservations.id, reservationId), eq(pmsReservations.tenantId, ctx.tenantId)),
      )
      .limit(1);
    if (!current) throw new NotFoundError('Reservation', reservationId);

    // Re-validate occupancy if adults/children changed
    if (input.adults !== undefined || input.children !== undefined) {
      const newAdults = input.adults ?? current.adults;
      const newChildren = input.children ?? current.children;
      const [roomType] = await tx
        .select()
        .from(pmsRoomTypes)
        .where(
          and(
            eq(pmsRoomTypes.id, current.roomTypeId),
            eq(pmsRoomTypes.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      if (roomType && newAdults + newChildren > roomType.maxOccupancy) {
        throw new ValidationError('Occupancy exceeds room type capacity', [
          {
            field: 'adults',
            message: `Total guests (${newAdults + newChildren}) exceeds max occupancy (${roomType.maxOccupancy})`,
          },
        ]);
      }
    }

    // Recalculate totals if rate changed
    let subtotalCents = current.subtotalCents;
    let taxCents = current.taxCents;
    let totalCents = current.totalCents;

    if (input.nightlyRateCents !== undefined) {
      subtotalCents = current.nights * input.nightlyRateCents;
      const [property] = await tx
        .select()
        .from(pmsProperties)
        .where(
          and(
            eq(pmsProperties.id, current.propertyId),
            eq(pmsProperties.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      const taxRatePct = property ? Number(property.taxRatePct ?? 0) : 0;
      taxCents = Math.round(subtotalCents * taxRatePct / 100);
      totalCents = subtotalCents + taxCents + current.feeCents;
    }

    // Build update set
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.guestId !== undefined) updates.guestId = input.guestId;
    if (input.primaryGuestJson !== undefined) updates.primaryGuestJson = input.primaryGuestJson;
    if (input.adults !== undefined) updates.adults = input.adults;
    if (input.children !== undefined) updates.children = input.children;
    if (input.nightlyRateCents !== undefined) {
      updates.nightlyRateCents = input.nightlyRateCents;
      updates.subtotalCents = subtotalCents;
      updates.taxCents = taxCents;
      updates.totalCents = totalCents;
    }
    if (input.ratePlanId !== undefined) updates.ratePlanId = input.ratePlanId;
    if (input.internalNotes !== undefined) updates.internalNotes = input.internalNotes;
    if (input.guestNotes !== undefined) updates.guestNotes = input.guestNotes;

    // Optimistic locking: version check + increment
    const [updated] = await tx
      .update(pmsReservations)
      .set({ ...updates, version: sql`version + 1` })
      .where(
        and(
          eq(pmsReservations.id, reservationId),
          eq(pmsReservations.tenantId, ctx.tenantId),
          eq(pmsReservations.version, input.version),
        ),
      )
      .returning();

    if (!updated) throw new ConcurrencyConflictError(reservationId);

    await pmsAuditLogEntry(tx, ctx, current.propertyId, 'reservation', reservationId, 'updated', updates);

    const event = buildEventFromContext(ctx, PMS_EVENTS.RESERVATION_UPDATED, {
      reservationId,
      propertyId: current.propertyId,
      version: updated.version,
      changes: Object.keys(updates).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'pms.reservation.updated', 'pms_reservation', result.id);
  return result;
}
