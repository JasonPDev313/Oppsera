import { sql, and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsReservations, pmsRoomBlocks, pmsFolios } from '@oppsera/db';
import type { CancelReservationInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { assertReservationTransition } from '../state-machines';
import { ConcurrencyConflictError } from '../errors';

/**
 * Cancel a reservation.
 * - Validates status transition to CANCELLED
 * - Removes room block
 * - Closes folio
 * - Increments version
 */
export async function cancelReservation(
  ctx: RequestContext,
  reservationId: string,
  input: CancelReservationInput,
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

    // Validate state transition
    assertReservationTransition(current.status, 'CANCELLED');

    // Deactivate room block if exists
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

    // Update reservation with optimistic locking
    const [updated] = await tx
      .update(pmsReservations)
      .set({
        status: 'CANCELLED',
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

    await pmsAuditLogEntry(tx, ctx, current.propertyId, 'reservation', reservationId, 'cancelled', {
      reason: input.reason ?? null,
      previousStatus: current.status,
    });

    const guestName = current.primaryGuestJson
      ? `${(current.primaryGuestJson as any).firstName} ${(current.primaryGuestJson as any).lastName}`
      : '';

    const event = buildEventFromContext(ctx, PMS_EVENTS.RESERVATION_CANCELLED, {
      reservationId,
      propertyId: current.propertyId,
      guestName,
      roomId: current.roomId,
      checkInDate: current.checkInDate,
      checkOutDate: current.checkOutDate,
      previousStatus: current.status,
      version: updated.version,
    });

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'pms.reservation.cancelled', 'pms_reservation', result.id);
  return result;
}
