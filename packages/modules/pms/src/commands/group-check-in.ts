import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { pmsGroups, pmsReservations, pmsRoomBlocks, pmsRooms, pmsFolios, pmsProperties } from '@oppsera/db';
import type { GroupCheckInInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { recalculateFolioTotals } from '../helpers/folio-totals';

export async function groupCheckIn(
  ctx: RequestContext,
  groupId: string,
  input: GroupCheckInInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [group] = await tx
      .select()
      .from(pmsGroups)
      .where(and(eq(pmsGroups.id, groupId), eq(pmsGroups.tenantId, ctx.tenantId)))
      .limit(1);

    if (!group) throw new NotFoundError('Group', groupId);

    if (group.status === 'cancelled') {
      throw new ValidationError('Cannot check in a cancelled group', [
        { field: 'groupId', message: 'Group is cancelled' },
      ]);
    }

    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, group.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    const taxRatePct = property ? Number(property.taxRatePct ?? 0) : 0;

    // Build room assignment map
    const roomMap = new Map<string, string>();
    for (const ra of input.roomAssignments ?? []) {
      roomMap.set(ra.reservationId, ra.roomId);
    }

    // Find reservations to check in
    let reservationRows: Iterable<Record<string, unknown>>;
    if (input.reservationIds && input.reservationIds.length > 0) {
      const idList = input.reservationIds.map((id) => sql`${id}`);
      reservationRows = await tx.execute(sql`
        SELECT id, room_id, room_type_id, check_in_date, check_out_date,
               nightly_rate_cents, nights, status, version, primary_guest_json
        FROM pms_reservations
        WHERE tenant_id = ${ctx.tenantId}
          AND group_id = ${groupId}
          AND id = ANY(ARRAY[${sql.join(idList, sql`, `)}])
          AND status IN ('CONFIRMED', 'HOLD')
      `);
    } else {
      reservationRows = await tx.execute(sql`
        SELECT id, room_id, room_type_id, check_in_date, check_out_date,
               nightly_rate_cents, nights, status, version, primary_guest_json
        FROM pms_reservations
        WHERE tenant_id = ${ctx.tenantId}
          AND group_id = ${groupId}
          AND status IN ('CONFIRMED', 'HOLD')
      `);
    }

    const arr = Array.from(reservationRows as Iterable<Record<string, unknown>>);
    const today = new Date().toISOString().split('T')[0]!;

    let checkedInCount = 0;
    let failedCount = 0;
    const failures: Array<{ reservationId: string; reason: string }> = [];

    for (const row of arr) {
      const resId = String(row.id);
      const roomId = roomMap.get(resId) ?? (row.room_id ? String(row.room_id) : null);

      if (!roomId) {
        failures.push({ reservationId: resId, reason: 'No room assigned' });
        failedCount++;
        continue;
      }

      try {
        // Verify the room is available before assigning it
        const [room] = await tx
          .select({ status: pmsRooms.status })
          .from(pmsRooms)
          .where(and(eq(pmsRooms.id, roomId), eq(pmsRooms.tenantId, ctx.tenantId)))
          .limit(1);

        if (!room) {
          failures.push({ reservationId: resId, reason: `Room ${roomId} not found` });
          failedCount++;
          continue;
        }
        if (!['VACANT_CLEAN', 'VACANT_DIRTY'].includes(room.status)) {
          failures.push({ reservationId: resId, reason: `Room is not available (status: ${room.status})` });
          failedCount++;
          continue;
        }

        // Determine check-in date (handle early check-in)
        let checkInDate = String(row.check_in_date);
        let nights = Number(row.nights);
        let subtotalCents = nights * Number(row.nightly_rate_cents);

        if (checkInDate > today) {
          checkInDate = today;
          nights = Math.round(
            (new Date(String(row.check_out_date)).getTime() - new Date(today).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          subtotalCents = nights * Number(row.nightly_rate_cents);
        }

        const taxCents = Math.round((subtotalCents * taxRatePct) / 100);
        const totalCents = subtotalCents + taxCents;

        // Create room block if not already assigned
        if (!row.room_id) {
          await tx.insert(pmsRoomBlocks).values({
            id: generateUlid(),
            tenantId: ctx.tenantId,
            propertyId: group.propertyId,
            roomId,
            reservationId: resId,
            startDate: checkInDate,
            endDate: String(row.check_out_date),
            blockType: 'RESERVATION',
            isActive: true,
          });
        }

        // Set room OCCUPIED
        await tx
          .update(pmsRooms)
          .set({ status: 'OCCUPIED', updatedAt: new Date() })
          .where(and(eq(pmsRooms.id, roomId), eq(pmsRooms.tenantId, ctx.tenantId)));

        // Post room charges to folio (guard against double-posting on retry)
        const [folio] = await tx
          .select()
          .from(pmsFolios)
          .where(
            and(
              eq(pmsFolios.reservationId, resId),
              eq(pmsFolios.tenantId, ctx.tenantId),
              eq(pmsFolios.status, 'OPEN'),
            ),
          )
          .limit(1);

        if (folio && nights > 0) {
          const existingChargeRows = await tx.execute(sql`
            SELECT COUNT(*) AS cnt FROM pms_folio_entries
            WHERE tenant_id = ${ctx.tenantId}
              AND folio_id = ${folio.id}
              AND entry_type = 'ROOM_CHARGE'
          `);
          const existingCount = Number(
            Array.from(existingChargeRows as Iterable<Record<string, unknown>>)[0]?.cnt ?? 0,
          );

          if (existingCount === 0) {
            const ciDate = new Date(checkInDate);
            const entryIds: string[] = [];
            const entryTypes: string[] = [];
            const descriptions: string[] = [];
            const amounts: number[] = [];
            const businessDates: string[] = [];

            for (let i = 0; i < nights; i++) {
              const d = new Date(ciDate);
              d.setDate(d.getDate() + i);
              const dateStr = d.toISOString().split('T')[0]!;
              const nightCharge = Number(row.nightly_rate_cents);
              const nightTax = Math.round((nightCharge * taxRatePct) / 100);

              entryIds.push(generateUlid());
              entryTypes.push('ROOM_CHARGE');
              descriptions.push(`Room charge - ${dateStr}`);
              amounts.push(nightCharge);
              businessDates.push(dateStr);

              if (nightTax > 0) {
                entryIds.push(generateUlid());
                entryTypes.push('TAX');
                descriptions.push(`Tax - ${dateStr}`);
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

        // Update reservation
        await tx
          .update(pmsReservations)
          .set({
            status: 'CHECKED_IN',
            roomId,
            checkInDate,
            nights,
            subtotalCents,
            taxCents,
            totalCents,
            checkedInAt: new Date(),
            checkedInBy: ctx.user.id,
            version: sql`version + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(pmsReservations.id, resId), eq(pmsReservations.tenantId, ctx.tenantId)));

        checkedInCount++;
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'Unknown error';
        failures.push({ reservationId: resId, reason });
        failedCount++;
      }
    }

    await pmsAuditLogEntry(tx, ctx, group.propertyId, 'group', groupId, 'checked_in', {
      checkedInCount,
      failedCount,
      failures,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.GROUP_CHECKED_IN, {
      groupId,
      propertyId: group.propertyId,
      name: group.name,
      checkedInCount,
      failedCount,
    });

    return { result: { groupId, checkedInCount, failedCount, failures }, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.group.checked_in', 'pms_group', groupId);
  return result;
}
