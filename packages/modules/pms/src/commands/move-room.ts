/**
 * Operational room move for a checked-in guest.
 * Different from calendar move — swaps room for remaining stay.
 */
import { sql, and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsReservations, pmsRoomBlocks, pmsRooms } from '@oppsera/db';
import type { MoveRoomInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { assertRoomAvailable, checkRoomNotOutOfOrder } from '../helpers/check-availability';
import { ConcurrencyConflictError } from '../errors';

export async function moveRoom(
  ctx: RequestContext,
  reservationId: string,
  input: MoveRoomInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load reservation (must be CHECKED_IN)
    const [current] = await tx
      .select()
      .from(pmsReservations)
      .where(
        and(eq(pmsReservations.id, reservationId), eq(pmsReservations.tenantId, ctx.tenantId)),
      )
      .limit(1);
    if (!current) throw new NotFoundError('Reservation', reservationId);

    if (current.status !== 'CHECKED_IN') {
      throw new ValidationError('Room move is only available for checked-in reservations', [
        { field: 'status', message: `Current status is ${current.status}, expected CHECKED_IN` },
      ]);
    }

    const oldRoomId = current.roomId;
    if (!oldRoomId) {
      throw new ValidationError('Reservation has no room assigned', [
        { field: 'roomId', message: 'No current room to move from' },
      ]);
    }

    // 2. Validate new room
    const [newRoom] = await tx
      .select()
      .from(pmsRooms)
      .where(and(eq(pmsRooms.id, input.newRoomId), eq(pmsRooms.tenantId, ctx.tenantId)))
      .limit(1);
    if (!newRoom) throw new NotFoundError('Room', input.newRoomId);

    if (newRoom.propertyId !== current.propertyId) {
      throw new ValidationError('New room must be in the same property', [
        { field: 'newRoomId', message: 'Room belongs to a different property' },
      ]);
    }

    await checkRoomNotOutOfOrder(tx, ctx.tenantId, input.newRoomId);

    // 3. Check availability for remaining dates
    const today = new Date().toISOString().split('T')[0]!;
    const remainingStart = today > current.checkInDate ? today : current.checkInDate;
    await assertRoomAvailable(tx, ctx.tenantId, input.newRoomId, remainingStart, current.checkOutDate, reservationId);

    // 4. Update room block: deactivate old, create new
    await tx
      .update(pmsRoomBlocks)
      .set({ isActive: false })
      .where(
        and(
          eq(pmsRoomBlocks.reservationId, reservationId),
          eq(pmsRoomBlocks.tenantId, ctx.tenantId),
          eq(pmsRoomBlocks.isActive, true),
        ),
      );

    await tx.insert(pmsRoomBlocks).values({
      id: generateUlid(),
      tenantId: ctx.tenantId,
      propertyId: current.propertyId,
      roomId: input.newRoomId,
      reservationId,
      startDate: current.checkInDate,
      endDate: current.checkOutDate,
      blockType: 'RESERVATION',
      isActive: true,
    });

    // 5. Update old room → VACANT_DIRTY
    await tx
      .update(pmsRooms)
      .set({ status: 'VACANT_DIRTY', updatedAt: new Date() })
      .where(and(eq(pmsRooms.id, oldRoomId), eq(pmsRooms.tenantId, ctx.tenantId)));

    // 6. Update new room → OCCUPIED
    await tx
      .update(pmsRooms)
      .set({ status: 'OCCUPIED', updatedAt: new Date() })
      .where(and(eq(pmsRooms.id, input.newRoomId), eq(pmsRooms.tenantId, ctx.tenantId)));

    // 7. Update reservation
    const [updated] = await tx
      .update(pmsReservations)
      .set({
        roomId: input.newRoomId,
        version: sql`version + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pmsReservations.id, reservationId),
          eq(pmsReservations.tenantId, ctx.tenantId),
          eq(pmsReservations.version, input.version),
        ),
      )
      .returning();

    if (!updated) throw new ConcurrencyConflictError(reservationId);

    await pmsAuditLogEntry(tx, ctx, reservationId, 'reservation', reservationId, 'room_moved', {
      oldRoomId,
      newRoomId: input.newRoomId,
    });

    const guestName = current.primaryGuestJson
      ? `${(current.primaryGuestJson as any).firstName} ${(current.primaryGuestJson as any).lastName}`
      : '';

    const event = buildEventFromContext(ctx, PMS_EVENTS.RESERVATION_MOVED, {
      reservationId,
      propertyId: current.propertyId,
      before: { roomId: oldRoomId, checkInDate: current.checkInDate, checkOutDate: current.checkOutDate },
      after: { roomId: input.newRoomId, checkInDate: current.checkInDate, checkOutDate: current.checkOutDate },
      guestName,
      status: 'CHECKED_IN',
      version: updated.version,
      resized: false,
    });

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'pms.reservation.room_moved', 'pms_reservation', result.id);
  return result;
}
