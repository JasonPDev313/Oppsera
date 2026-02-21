/**
 * Calendar resize command — extend or shrink a reservation by dragging an edge.
 */
import { sql, and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsReservations, pmsRoomBlocks, pmsProperties } from '@oppsera/db';
import type { CalendarResizeInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { assertRoomAvailable, checkRoomNotOutOfOrder } from '../helpers/check-availability';
import { checkPmsIdempotency, savePmsIdempotencyKey } from '../helpers/pms-idempotency';
import { IMMOVABLE_STATUSES } from '../state-machines';
import { ConcurrencyConflictError, ReservationNotMovableError } from '../errors';

export async function resizeReservation(ctx: RequestContext, input: CalendarResizeInput) {
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

    // 5. Determine new dates based on edge
    let newCheckIn = current.checkInDate;
    let newCheckOut = current.checkOutDate;

    if (input.edge === 'LEFT') {
      // Cannot resize left on checked-in reservations
      if (current.status === 'CHECKED_IN') {
        throw new ValidationError('Cannot change check-in date after check-in', [
          { field: 'edge', message: 'LEFT resize is not allowed for checked-in reservations' },
        ]);
      }
      if (!input.to.checkInDate) {
        throw new ValidationError('checkInDate required for LEFT resize', [
          { field: 'to.checkInDate', message: 'Required' },
        ]);
      }
      newCheckIn = input.to.checkInDate;
    } else {
      if (!input.to.checkOutDate) {
        throw new ValidationError('checkOutDate required for RIGHT resize', [
          { field: 'to.checkOutDate', message: 'Required' },
        ]);
      }
      // For checked-in, only allow extend (not shorten)
      if (current.status === 'CHECKED_IN' && input.to.checkOutDate < current.checkOutDate) {
        throw new ValidationError('Cannot shorten a checked-in reservation', [
          { field: 'to.checkOutDate', message: 'Can only extend checked-in reservations' },
        ]);
      }
      newCheckOut = input.to.checkOutDate;
    }

    // 6. Validate >= 1 night
    if (newCheckOut <= newCheckIn) {
      throw new ValidationError('Reservation must be at least 1 night', [
        { field: 'checkOutDate', message: 'Check-out must be after check-in' },
      ]);
    }

    const newNights = Math.round(
      (new Date(newCheckOut).getTime() - new Date(newCheckIn).getTime()) / (1000 * 60 * 60 * 24),
    );

    // 7. Check availability for new date range (exclude self)
    const roomId = current.roomId ?? input.from.roomId;
    await checkRoomNotOutOfOrder(tx, ctx.tenantId, roomId);
    await assertRoomAvailable(tx, ctx.tenantId, roomId, newCheckIn, newCheckOut, input.reservationId);

    // 8. Recalculate totals
    const subtotalCents = newNights * current.nightlyRateCents;
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, current.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    const taxRatePct = property ? Number(property.taxRatePct ?? 0) : 0;
    const taxCents = Math.round(subtotalCents * taxRatePct / 100);
    const totalCents = subtotalCents + taxCents + current.feeCents;

    // 9. Update room block
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

    await tx.insert(pmsRoomBlocks).values({
      id: generateUlid(),
      tenantId: ctx.tenantId,
      propertyId: current.propertyId,
      roomId,
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
    await savePmsIdempotencyKey(tx, ctx.tenantId, input.idempotencyKey, 'resizeReservation', responseData);

    await pmsAuditLogEntry(tx, ctx, input.reservationId, 'reservation', input.reservationId, 'resized', {
      edge: input.edge,
      before: { checkInDate: current.checkInDate, checkOutDate: current.checkOutDate },
      after: { checkInDate: newCheckIn, checkOutDate: newCheckOut },
    });

    const guestName = current.primaryGuestJson
      ? `${(current.primaryGuestJson as any).firstName} ${(current.primaryGuestJson as any).lastName}`
      : '';

    const event = buildEventFromContext(ctx, PMS_EVENTS.RESERVATION_MOVED, {
      reservationId: input.reservationId,
      propertyId: current.propertyId,
      before: { roomId: current.roomId, checkInDate: current.checkInDate, checkOutDate: current.checkOutDate },
      after: { roomId, checkInDate: newCheckIn, checkOutDate: newCheckOut },
      guestName,
      status: updated.status,
      version: updated.version,
      resized: true,
    });

    return { result: responseData, events: [event] };
  });

  await auditLog(ctx, 'pms.reservation.resized', 'pms_reservation', result.id ?? input.reservationId);
  return result;
}
