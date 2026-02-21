import { sql, and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsReservations, pmsRoomBlocks, pmsFolios } from '@oppsera/db';
import type { MarkNoShowInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { assertReservationTransition } from '../state-machines';
import { ConcurrencyConflictError } from '../errors';

/**
 * Mark a reservation as no-show.
 * - Validates status is CONFIRMED
 * - Validates check-in date has passed
 * - Removes room block
 * - Closes folio
 */
export async function markNoShow(
  ctx: RequestContext,
  reservationId: string,
  input: MarkNoShowInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load reservation
    const [current] = await tx
      .select()
      .from(pmsReservations)
      .where(
        and(eq(pmsReservations.id, reservationId), eq(pmsReservations.tenantId, ctx.tenantId)),
      )
      .limit(1);
    if (!current) throw new NotFoundError('Reservation', reservationId);

    // Validate transition
    assertReservationTransition(current.status, 'NO_SHOW');

    // Validate check-in date has passed (or is today)
    const today = new Date().toISOString().split('T')[0]!;
    if (current.checkInDate > today) {
      throw new ValidationError('Cannot mark no-show before check-in date', [
        { field: 'checkInDate', message: `Check-in date ${current.checkInDate} is in the future` },
      ]);
    }

    // Deactivate room block
    if (current.roomId) {
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
    }

    // Close folio
    await tx
      .update(pmsFolios)
      .set({ status: 'CLOSED', updatedAt: new Date() })
      .where(
        and(
          eq(pmsFolios.reservationId, reservationId),
          eq(pmsFolios.tenantId, ctx.tenantId),
          eq(pmsFolios.status, 'OPEN'),
        ),
      );

    // Update reservation
    const [updated] = await tx
      .update(pmsReservations)
      .set({
        status: 'NO_SHOW',
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

    await pmsAuditLogEntry(tx, ctx, reservationId, 'reservation', reservationId, 'no_show', {
      previousStatus: current.status,
      checkInDate: current.checkInDate,
    });

    const guestName = current.primaryGuestJson
      ? `${(current.primaryGuestJson as any).firstName} ${(current.primaryGuestJson as any).lastName}`
      : '';

    const event = buildEventFromContext(ctx, PMS_EVENTS.RESERVATION_NO_SHOW, {
      reservationId,
      propertyId: current.propertyId,
      guestName,
      roomId: current.roomId,
      checkInDate: current.checkInDate,
      checkOutDate: current.checkOutDate,
      version: updated.version,
    });

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'pms.reservation.no_show', 'pms_reservation', result.id);
  return result;
}
