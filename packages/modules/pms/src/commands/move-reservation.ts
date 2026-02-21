/**
 * Calendar move command — drag a reservation to a new room/date.
 * Undo is just another move with from/to reversed (no special endpoint).
 */
import { sql, and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsReservations, pmsRoomBlocks, pmsProperties } from '@oppsera/db';
import type { CalendarMoveInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { assertRoomAvailable, checkRoomNotOutOfOrder } from '../helpers/check-availability';
import { checkPmsIdempotency, savePmsIdempotencyKey } from '../helpers/pms-idempotency';
import { IMMOVABLE_STATUSES } from '../state-machines';
import { ConcurrencyConflictError, ReservationNotMovableError } from '../errors';

export async function moveReservation(ctx: RequestContext, input: CalendarMoveInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Idempotency check
    const idempotency = await checkPmsIdempotency(tx, ctx.tenantId, input.idempotencyKey);
    if (idempotency.isDuplicate) {
      return { result: idempotency.cachedResponse as any, events: [] };
    }

    // 2. Load reservation
    const [current] = await tx
      .select()
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.id, input.reservationId),
          eq(pmsReservations.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    if (!current) throw new NotFoundError('Reservation', input.reservationId);

    // 3. Version check
    if (current.version !== input.from.version) {
      throw new ConcurrencyConflictError(input.reservationId);
    }

    // 4. Status check
    if ((IMMOVABLE_STATUSES as readonly string[]).includes(current.status)) {
      throw new ReservationNotMovableError(current.status);
    }

    // 5. Compute new dates (keep same duration)
    const oldCheckIn = new Date(current.checkInDate);
    const oldCheckOut = new Date(current.checkOutDate);
    const durationMs = oldCheckOut.getTime() - oldCheckIn.getTime();
    const newCheckIn = input.to.checkInDate;
    const newCheckInDate = new Date(newCheckIn);
    const newCheckOutDate = new Date(newCheckInDate.getTime() + durationMs);
    const newCheckOut = newCheckOutDate.toISOString().split('T')[0]!;
    const newRoomId = input.to.roomId;

    // 6. Check availability on new room + dates (exclude self)
    await checkRoomNotOutOfOrder(tx, ctx.tenantId, newRoomId);
    await assertRoomAvailable(tx, ctx.tenantId, newRoomId, newCheckIn, newCheckOut, input.reservationId);

    // 7. Calculate new totals if nights changed
    const newNights = Math.round(durationMs / (1000 * 60 * 60 * 24));
    let subtotalCents = current.subtotalCents;
    let taxCents = current.taxCents;
    let totalCents = current.totalCents;

    if (newNights !== current.nights) {
      subtotalCents = newNights * current.nightlyRateCents;
      const [property] = await tx
        .select()
        .from(pmsProperties)
        .where(and(eq(pmsProperties.id, current.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
        .limit(1);
      const taxRatePct = property ? Number(property.taxRatePct ?? 0) : 0;
      taxCents = Math.round(subtotalCents * taxRatePct / 100);
      totalCents = subtotalCents + taxCents + current.feeCents;
    }

    // 8. Deactivate old room block
    await tx
      .update(pmsRoomBlocks)
      .set({ isActive: false })
      .where(
        and(
          eq(pmsRoomBlocks.reservationId, input.reservationId),
          eq(pmsRoomBlocks.tenantId, ctx.tenantId),
          eq(pmsRoomBlocks.isActive, true),
        ),
      );

    // 9. Insert new room block
    await tx.insert(pmsRoomBlocks).values({
      id: generateUlid(),
      tenantId: ctx.tenantId,
      propertyId: current.propertyId,
      roomId: newRoomId,
      reservationId: input.reservationId,
      startDate: newCheckIn,
      endDate: newCheckOut,
      blockType: 'RESERVATION',
      isActive: true,
    });

    // 10. Update reservation
    const [updated] = await tx
      .update(pmsReservations)
      .set({
        roomId: newRoomId,
        checkInDate: newCheckIn,
        checkOutDate: newCheckOut,
        nights: newNights,
        subtotalCents,
        taxCents,
        totalCents,
        version: sql`version + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pmsReservations.id, input.reservationId),
          eq(pmsReservations.tenantId, ctx.tenantId),
          eq(pmsReservations.version, input.from.version),
        ),
      )
      .returning();

    if (!updated) throw new ConcurrencyConflictError(input.reservationId);

    // 11. Save idempotency key
    const responseData = {
      id: updated.id,
      roomId: updated.roomId,
      checkInDate: updated.checkInDate,
      checkOutDate: updated.checkOutDate,
      version: updated.version,
      status: updated.status,
      subtotalCents: updated.subtotalCents,
      totalCents: updated.totalCents,
    };
    await savePmsIdempotencyKey(tx, ctx.tenantId, input.idempotencyKey, 'moveReservation', responseData);

    // 12. Audit
    await pmsAuditLogEntry(tx, ctx, input.reservationId, 'reservation', input.reservationId, 'moved', {
      before: { roomId: current.roomId, checkInDate: current.checkInDate, checkOutDate: current.checkOutDate },
      after: { roomId: newRoomId, checkInDate: newCheckIn, checkOutDate: newCheckOut },
    });

    const guestName = current.primaryGuestJson
      ? `${(current.primaryGuestJson as any).firstName} ${(current.primaryGuestJson as any).lastName}`
      : '';

    const event = buildEventFromContext(ctx, PMS_EVENTS.RESERVATION_MOVED, {
      reservationId: input.reservationId,
      propertyId: current.propertyId,
      before: { roomId: current.roomId, checkInDate: current.checkInDate, checkOutDate: current.checkOutDate },
      after: { roomId: newRoomId, checkInDate: newCheckIn, checkOutDate: newCheckOut },
      guestName,
      status: updated.status,
      version: updated.version,
      resized: false,
    });

    return { result: responseData, events: [event] };
  });

  await auditLog(ctx, 'pms.reservation.moved', 'pms_reservation', result.id ?? input.reservationId);
  return result;
}
