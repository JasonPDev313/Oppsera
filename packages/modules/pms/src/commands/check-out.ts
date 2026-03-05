/**
 * Check out a guest.
 * - Sets room status to VACANT_DIRTY
 * - Handles late check-out (extra night charges)
 * - Deactivates room block
 * - Closes folio
 *
 * Performance: batch folio entry inserts, single property fetch.
 */
import { sql, and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import {
  pmsReservations,
  pmsRoomBlocks,
  pmsRooms,
  pmsFolios,
  pmsProperties,
} from '@oppsera/db';
import type { CheckOutInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { assertReservationTransition } from '../state-machines';
import { ConcurrencyConflictError } from '../errors';

export async function checkOut(
  ctx: RequestContext,
  reservationId: string,
  input: CheckOutInput,
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
    assertReservationTransition(current.status, 'CHECKED_OUT');

    // 3. Handle late check-out
    const today = new Date().toISOString().split('T')[0]!;
    let lateCheckOut = false;
    let checkOutDate = current.checkOutDate;
    // Fetched once when lateCheckOut is true; reused for both charge posting and totals recalculation
    let property: { taxRatePct?: string | null } | undefined;

    if (today > current.checkOutDate) {
      lateCheckOut = true;
      checkOutDate = today;

      // Post extra night charges (batch insert)
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

      // Fetch property once for both late-checkout charge posting and totals recalculation below
      const [fetchedProperty] = await tx
        .select()
        .from(pmsProperties)
        .where(
          and(eq(pmsProperties.id, current.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)),
        )
        .limit(1);
      property = fetchedProperty;

      if (folio) {
        const taxRatePct = property ? Number(property.taxRatePct ?? 0) : 0;

        const originalCheckOut = new Date(current.checkOutDate);
        const todayDate = new Date(today);
        const extraNights = Math.round(
          (todayDate.getTime() - originalCheckOut.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (extraNights > 0) {
          // Build batch arrays for extra night folio entries
          const entryIds: string[] = [];
          const entryTypes: string[] = [];
          const descriptions: string[] = [];
          const amounts: number[] = [];
          const businessDates: string[] = [];

          for (let i = 0; i < extraNights; i++) {
            const d = new Date(originalCheckOut);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0]!;
            const nightCharge = current.nightlyRateCents;
            const nightTax = Math.round((nightCharge * taxRatePct) / 100);

            entryIds.push(generateUlid());
            entryTypes.push('ROOM_CHARGE');
            descriptions.push(`Late checkout - Room charge - ${dateStr}`);
            amounts.push(nightCharge);
            businessDates.push(dateStr);

            if (nightTax > 0) {
              entryIds.push(generateUlid());
              entryTypes.push('TAX');
              descriptions.push(`Late checkout - Tax - ${dateStr}`);
              amounts.push(nightTax);
              businessDates.push(dateStr);
            }
          }

          // Single batch insert for all extra night entries
          const eIdsArr = sql`ARRAY[${sql.join(entryIds.map(v => sql`${v}`), sql`, `)}]`;
          const eTypesArr = sql`ARRAY[${sql.join(entryTypes.map(v => sql`${v}`), sql`, `)}]`;
          const eDescsArr = sql`ARRAY[${sql.join(descriptions.map(v => sql`${v}`), sql`, `)}]`;
          const eAmtsArr = sql`ARRAY[${sql.join(amounts.map(v => sql`${v}::int`), sql`, `)}]`;
          const eDatesArr = sql`ARRAY[${sql.join(businessDates.map(v => sql`${v}::date`), sql`, `)}]`;
          await tx.execute(sql`
            INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, posted_by)
            SELECT
              unnest(${eIdsArr}),
              ${ctx.tenantId},
              ${folio.id},
              unnest(${eTypesArr}),
              unnest(${eDescsArr}),
              unnest(${eAmtsArr}),
              unnest(${eDatesArr}),
              ${ctx.user.id}
          `);
        }
      }

      // Update room block
      await tx
        .update(pmsRoomBlocks)
        .set({ endDate: checkOutDate })
        .where(
          and(
            eq(pmsRoomBlocks.reservationId, reservationId),
            eq(pmsRoomBlocks.tenantId, ctx.tenantId),
            eq(pmsRoomBlocks.isActive, true),
          ),
        );
    }

    // 4. Deactivate room block (keep historical, just mark inactive)
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

    // 5. Set room to VACANT_DIRTY
    if (current.roomId) {
      await tx
        .update(pmsRooms)
        .set({ status: 'VACANT_DIRTY', updatedAt: new Date() })
        .where(and(eq(pmsRooms.id, current.roomId), eq(pmsRooms.tenantId, ctx.tenantId)));
    }

    // 6. Close folio
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

    // 7. Recalculate totals if late checkout (single property fetch)
    let nights = current.nights;
    let subtotalCents = current.subtotalCents;
    let taxCents = current.taxCents;
    let totalCents = current.totalCents;

    if (lateCheckOut) {
      nights = Math.round(
        (new Date(checkOutDate).getTime() - new Date(current.checkInDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      subtotalCents = nights * current.nightlyRateCents;
      // Reuse the property already fetched above during the late-checkout block
      const taxRatePct = property ? Number(property.taxRatePct ?? 0) : 0;
      taxCents = Math.round((subtotalCents * taxRatePct) / 100);
      totalCents = subtotalCents + taxCents + current.feeCents;
    }

    // 8. Update reservation
    const [updated] = await tx
      .update(pmsReservations)
      .set({
        status: 'CHECKED_OUT',
        checkOutDate,
        nights,
        subtotalCents,
        taxCents,
        totalCents,
        checkedOutAt: new Date(),
        checkedOutBy: ctx.user.id,
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

    await pmsAuditLogEntry(tx, ctx, current.propertyId, 'reservation', reservationId, 'checked_out', {
      roomId: current.roomId,
      lateCheckOut,
      checkOutDate,
    });

    const guestName = current.primaryGuestJson
      ? `${(current.primaryGuestJson as any).firstName} ${(current.primaryGuestJson as any).lastName}`
      : '';

    const event = buildEventFromContext(ctx, PMS_EVENTS.RESERVATION_CHECKED_OUT, {
      reservationId,
      propertyId: current.propertyId,
      guestName,
      roomId: current.roomId,
      checkInDate: current.checkInDate,
      checkOutDate,
      lateCheckOut,
      version: updated.version,
    });

    return { result: updated, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.reservation.checked_out', 'pms_reservation', result.id);
  return result;
}
