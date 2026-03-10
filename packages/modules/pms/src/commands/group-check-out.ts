import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { pmsGroups, pmsReservations, pmsRoomBlocks, pmsRooms, pmsFolios, pmsProperties } from '@oppsera/db';
import type { GroupCheckOutInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { recalculateFolioTotals } from '../helpers/folio-totals';

export async function groupCheckOut(
  ctx: RequestContext,
  groupId: string,
  input: GroupCheckOutInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [group] = await tx
      .select()
      .from(pmsGroups)
      .where(and(eq(pmsGroups.id, groupId), eq(pmsGroups.tenantId, ctx.tenantId)))
      .limit(1);

    if (!group) throw new NotFoundError('Group', groupId);

    if (group.status === 'cancelled') {
      throw new ValidationError('Cannot check out a cancelled group', [
        { field: 'groupId', message: 'Group is cancelled' },
      ]);
    }

    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, group.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    const taxRatePct = property ? Number(property.taxRatePct ?? 0) : 0;

    // Find reservations to check out
    let reservationRows: Iterable<Record<string, unknown>>;
    if (input.reservationIds && input.reservationIds.length > 0) {
      const idList = input.reservationIds.map((id) => sql`${id}`);
      reservationRows = await tx.execute(sql`
        SELECT id, room_id, check_in_date, check_out_date, nightly_rate_cents, nights,
               subtotal_cents, tax_cents, fee_cents, total_cents, status, version
        FROM pms_reservations
        WHERE tenant_id = ${ctx.tenantId}
          AND group_id = ${groupId}
          AND id = ANY(ARRAY[${sql.join(idList, sql`, `)}])
          AND status = 'CHECKED_IN'
      `);
    } else {
      reservationRows = await tx.execute(sql`
        SELECT id, room_id, check_in_date, check_out_date, nightly_rate_cents, nights,
               subtotal_cents, tax_cents, fee_cents, total_cents, status, version
        FROM pms_reservations
        WHERE tenant_id = ${ctx.tenantId}
          AND group_id = ${groupId}
          AND status = 'CHECKED_IN'
      `);
    }

    const arr = Array.from(reservationRows as Iterable<Record<string, unknown>>);
    const today = new Date().toISOString().split('T')[0]!;

    let checkedOutCount = 0;
    let failedCount = 0;
    const failures: Array<{ reservationId: string; reason: string }> = [];

    for (const row of arr) {
      const resId = String(row.id);

      try {
        let checkOutDate = String(row.check_out_date);
        let nights = Number(row.nights);
        let subtotalCents = Number(row.subtotal_cents);
        let taxCents = Number(row.tax_cents);
        let totalCents = Number(row.total_cents);
        const feeCents = Number(row.fee_cents ?? 0);

        // Handle late checkout
        if (today > checkOutDate) {
          checkOutDate = today;

          const folio = await tx
            .select()
            .from(pmsFolios)
            .where(
              and(
                eq(pmsFolios.reservationId, resId),
                eq(pmsFolios.tenantId, ctx.tenantId),
                eq(pmsFolios.status, 'OPEN'),
              ),
            )
            .limit(1)
            .then((r) => r[0]);

          if (folio) {
            const originalCheckOut = new Date(String(row.check_out_date));
            const todayDate = new Date(today);
            const extraNights = Math.round(
              (todayDate.getTime() - originalCheckOut.getTime()) / (1000 * 60 * 60 * 24),
            );

            if (extraNights > 0) {
              const entryIds: string[] = [];
              const entryTypes: string[] = [];
              const descriptions: string[] = [];
              const amounts: number[] = [];
              const businessDates: string[] = [];

              for (let i = 0; i < extraNights; i++) {
                const d = new Date(originalCheckOut);
                d.setDate(d.getDate() + i);
                const dateStr = d.toISOString().split('T')[0]!;
                const nightCharge = Number(row.nightly_rate_cents);
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

              const eIdsArr = sql`ARRAY[${sql.join(entryIds.map((v) => sql`${v}`), sql`, `)}]`;
              const eTypesArr = sql`ARRAY[${sql.join(entryTypes.map((v) => sql`${v}`), sql`, `)}]`;
              const eDescsArr = sql`ARRAY[${sql.join(descriptions.map((v) => sql`${v}`), sql`, `)}]`;
              const eAmtsArr = sql`ARRAY[${sql.join(amounts.map((v) => sql`${v}::int`), sql`, `)}]`;
              const eDatesArr = sql`ARRAY[${sql.join(businessDates.map((v) => sql`${v}::date`), sql`, `)}]`;
              await tx.execute(sql`
                INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, posted_by)
                SELECT unnest(${eIdsArr}), ${ctx.tenantId}, ${folio.id},
                       unnest(${eTypesArr}), unnest(${eDescsArr}), unnest(${eAmtsArr}), unnest(${eDatesArr}), ${ctx.user.id}
              `);
              // Recalculate from entries so balanceCents and paymentCents stay in sync
              await recalculateFolioTotals(tx, ctx.tenantId, folio.id);
            }
          }

          // Recalculate totals
          nights = Math.round(
            (new Date(checkOutDate).getTime() - new Date(String(row.check_in_date)).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          subtotalCents = nights * Number(row.nightly_rate_cents);
          taxCents = Math.round((subtotalCents * taxRatePct) / 100);
          totalCents = subtotalCents + taxCents + feeCents;
        }

        // Deactivate room block
        await tx
          .update(pmsRoomBlocks)
          .set({ isActive: false })
          .where(
            and(
              eq(pmsRoomBlocks.reservationId, resId),
              eq(pmsRoomBlocks.tenantId, ctx.tenantId),
              eq(pmsRoomBlocks.isActive, true),
            ),
          );

        // Set room VACANT_DIRTY
        if (row.room_id) {
          await tx
            .update(pmsRooms)
            .set({ status: 'VACANT_DIRTY', updatedAt: new Date() })
            .where(and(eq(pmsRooms.id, String(row.room_id)), eq(pmsRooms.tenantId, ctx.tenantId)));
        }

        // Close folio
        await tx
          .update(pmsFolios)
          .set({ status: 'CLOSED', updatedAt: new Date() })
          .where(
            and(
              eq(pmsFolios.reservationId, resId),
              eq(pmsFolios.tenantId, ctx.tenantId),
              eq(pmsFolios.status, 'OPEN'),
            ),
          );

        // Update reservation
        await tx
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
          .where(and(eq(pmsReservations.id, resId), eq(pmsReservations.tenantId, ctx.tenantId)));

        checkedOutCount++;
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'Unknown error';
        failures.push({ reservationId: resId, reason });
        failedCount++;
      }
    }

    await pmsAuditLogEntry(tx, ctx, group.propertyId, 'group', groupId, 'checked_out', {
      checkedOutCount,
      failedCount,
      failures,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.GROUP_CHECKED_OUT, {
      groupId,
      propertyId: group.propertyId,
      name: group.name,
      checkedOutCount,
      failedCount,
    });

    return { result: { groupId, checkedOutCount, failedCount, failures }, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.group.checked_out', 'pms_group', groupId);
  return result;
}
