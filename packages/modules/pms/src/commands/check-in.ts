/**
 * Check-in a guest.
 * - Room must be assigned (either pre-assigned or provided at check-in)
 * - Posts room charges + tax to folio for all nights
 * - Sets room status to OCCUPIED
 * - Handles early check-in (adjust dates + recalculate)
 *
 * Performance: batch folio entry inserts, single property fetch.
 */
import { sql, and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import {
  pmsReservations,
  pmsRoomBlocks,
  pmsRooms,
  pmsFolios,
  pmsFolioEntries,
  pmsProperties,
} from '@oppsera/db';
import type { CheckInInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { assertReservationTransition } from '../state-machines';
import { assertRoomAvailable, checkRoomNotOutOfOrder } from '../helpers/check-availability';
import { ConcurrencyConflictError } from '../errors';

export async function checkIn(
  ctx: RequestContext,
  reservationId: string,
  input: CheckInInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load reservation
    const [current] = await tx
      .select()
      .from(pmsReservations)
      .where(
        and(eq(pmsReservations.id, reservationId), eq(pmsReservations.tenantId, ctx.tenantId)),
      )
      .limit(1);
    if (!current) throw new NotFoundError('Reservation', reservationId);

    // 2. Validate transition
    assertReservationTransition(current.status, 'CHECKED_IN');

    // 3. Room assignment
    const roomId = current.roomId ?? input.roomId;
    if (!roomId) {
      throw new ValidationError('Room must be assigned at check-in', [
        { field: 'roomId', message: 'Room ID is required' },
      ]);
    }

    // 4. Validate room
    const [room] = await tx
      .select()
      .from(pmsRooms)
      .where(and(eq(pmsRooms.id, roomId), eq(pmsRooms.tenantId, ctx.tenantId)))
      .limit(1);
    if (!room) throw new NotFoundError('Room', roomId);

    await checkRoomNotOutOfOrder(tx, ctx.tenantId, roomId);

    // 5. Fetch property ONCE (needed for both early check-in recalc and folio tax)
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(
        and(eq(pmsProperties.id, current.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)),
      )
      .limit(1);
    const taxRatePct = property ? Number(property.taxRatePct ?? 0) : 0;

    // 6. Handle early check-in
    const today = new Date().toISOString().split('T')[0]!;
    let checkInDate = current.checkInDate;
    let nights = current.nights;
    let subtotalCents = current.subtotalCents;
    let taxCents = current.taxCents;
    let totalCents = current.totalCents;
    let earlyCheckIn = false;

    if (current.checkInDate > today) {
      earlyCheckIn = true;
      checkInDate = today;
      nights = Math.round(
        (new Date(current.checkOutDate).getTime() - new Date(today).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      subtotalCents = nights * current.nightlyRateCents;
      taxCents = Math.round((subtotalCents * taxRatePct) / 100);
      totalCents = subtotalCents + taxCents + current.feeCents;
    }

    // 7. Check availability if room is new assignment
    if (!current.roomId) {
      await assertRoomAvailable(tx, ctx.tenantId, roomId, checkInDate, current.checkOutDate, reservationId);

      // Create room block
      await tx.insert(pmsRoomBlocks).values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        propertyId: current.propertyId,
        roomId,
        reservationId,
        startDate: checkInDate,
        endDate: current.checkOutDate,
        blockType: 'RESERVATION',
        isActive: true,
      });
    } else if (earlyCheckIn) {
      // Update existing room block for early check-in
      await tx
        .update(pmsRoomBlocks)
        .set({ startDate: checkInDate })
        .where(
          and(
            eq(pmsRoomBlocks.reservationId, reservationId),
            eq(pmsRoomBlocks.tenantId, ctx.tenantId),
            eq(pmsRoomBlocks.isActive, true),
          ),
        );
    }

    // 8. Update room status to OCCUPIED
    await tx
      .update(pmsRooms)
      .set({ status: 'OCCUPIED', updatedAt: new Date() })
      .where(and(eq(pmsRooms.id, roomId), eq(pmsRooms.tenantId, ctx.tenantId)));

    // 9. Post room charges to folio (batch insert)
    const [folio] = await tx
      .select()
      .from(pmsFolios)
      .where(
        and(
          eq(pmsFolios.reservationId, reservationId),
          eq(pmsFolios.tenantId, ctx.tenantId),
          eq(pmsFolios.status, 'OPEN'),
        ),
      )
      .limit(1);

    if (folio) {
      const ciDate = new Date(checkInDate);
      const coDate = new Date(current.checkOutDate);
      const nightCount = Math.round((coDate.getTime() - ciDate.getTime()) / (1000 * 60 * 60 * 24));

      if (nightCount > 0) {
        // Build batch arrays for folio entries
        const entryIds: string[] = [];
        const entryTypes: string[] = [];
        const descriptions: string[] = [];
        const amounts: number[] = [];
        const businessDates: string[] = [];

        let folioSubtotal = 0;
        let folioTax = 0;

        for (let i = 0; i < nightCount; i++) {
          const d = new Date(ciDate);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().split('T')[0]!;
          const nightCharge = current.nightlyRateCents;
          const nightTax = Math.round((nightCharge * taxRatePct) / 100);

          // Room charge entry
          entryIds.push(generateUlid());
          entryTypes.push('ROOM_CHARGE');
          descriptions.push(`Room charge - ${dateStr}`);
          amounts.push(nightCharge);
          businessDates.push(dateStr);
          folioSubtotal += nightCharge;

          // Tax entry
          if (nightTax > 0) {
            entryIds.push(generateUlid());
            entryTypes.push('TAX');
            descriptions.push(`Tax - ${dateStr}`);
            amounts.push(nightTax);
            businessDates.push(dateStr);
            folioTax += nightTax;
          }
        }

        // Single batch insert for all folio entries
        await tx.execute(sql`
          INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, posted_by)
          SELECT
            unnest(${entryIds}::text[]),
            ${ctx.tenantId},
            ${folio.id},
            unnest(${entryTypes}::text[]),
            unnest(${descriptions}::text[]),
            unnest(${amounts}::int[]),
            unnest(${businessDates}::date[]),
            ${ctx.user.id}
        `);

        // Update folio totals
        await tx
          .update(pmsFolios)
          .set({
            subtotalCents: folioSubtotal,
            taxCents: folioTax,
            totalCents: folioSubtotal + folioTax,
            updatedAt: new Date(),
          })
          .where(and(eq(pmsFolios.id, folio.id), eq(pmsFolios.tenantId, ctx.tenantId)));
      }
    }

    // 10. Update reservation
    const [updated] = await tx
      .update(pmsReservations)
      .set({
        status: 'CHECKED_IN',
        roomId,
        checkInDate,
        nights,
        subtotalCents,
        taxCents,
        totalCents,
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

    await pmsAuditLogEntry(tx, ctx, current.propertyId, 'reservation', reservationId, 'checked_in', {
      roomId,
      earlyCheckIn,
      checkInDate,
    });

    const guestName = current.primaryGuestJson
      ? `${(current.primaryGuestJson as any).firstName} ${(current.primaryGuestJson as any).lastName}`
      : '';

    const event = buildEventFromContext(ctx, PMS_EVENTS.RESERVATION_CHECKED_IN, {
      reservationId,
      propertyId: current.propertyId,
      guestName,
      roomId,
      checkInDate,
      checkOutDate: current.checkOutDate,
      earlyCheckIn,
      version: updated.version,
    });

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'pms.reservation.checked_in', 'pms_reservation', result.id);
  return result;
}
