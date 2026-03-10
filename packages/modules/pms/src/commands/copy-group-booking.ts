import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { pmsGroups } from '@oppsera/db';
import type { CopyGroupInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function copyGroupBooking(
  ctx: RequestContext,
  sourceGroupId: string,
  input: CopyGroupInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'pms.copyGroup');
      if (check.isDuplicate) return { result: check.originalResult as { newGroupId: string }, events: [] };
    }

    const [source] = await tx
      .select()
      .from(pmsGroups)
      .where(and(eq(pmsGroups.id, sourceGroupId), eq(pmsGroups.tenantId, ctx.tenantId)))
      .limit(1);

    if (!source) throw new NotFoundError('Group', sourceGroupId);

    // Acquire a transaction-scoped advisory lock to serialize concurrent group
    // creates and prevent duplicate confirmation numbers.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId} || ':grp:' || ${source.propertyId})::bigint)
    `);
    const confRows = await tx.execute(sql`
      SELECT COALESCE(MAX(confirmation_number), 0) + 1 AS next_num
      FROM pms_groups
      WHERE tenant_id = ${ctx.tenantId} AND property_id = ${source.propertyId}
    `);
    const confArr = Array.from(confRows as Iterable<Record<string, unknown>>);
    const confirmationNumber = Number(confArr[0]?.next_num ?? 1);

    const newGroupId = generateUlid();

    const [newGroup] = await tx
      .insert(pmsGroups)
      .values({
        id: newGroupId,
        tenantId: ctx.tenantId,
        propertyId: source.propertyId,
        name: input.newName,
        groupCode: input.newGroupCode ?? null,
        confirmationNumber,
        groupType: source.groupType as 'tour' | 'corporate' | 'wedding' | 'conference' | 'sports' | 'other',
        contactName: source.contactName,
        contactEmail: source.contactEmail,
        contactPhone: source.contactPhone,
        corporateAccountId: source.corporateAccountId,
        ratePlanId: source.ratePlanId,
        negotiatedRateCents: source.negotiatedRateCents,
        startDate: input.newStartDate,
        endDate: input.newEndDate,
        cutoffDate: input.newCutoffDate ?? null,
        status: 'tentative',
        billingType: source.billingType as 'individual' | 'master' | 'split',
        notes: source.notes,
        source: source.source,
        market: source.market,
        bookingMethod: source.bookingMethod,
        salesRepUserId: source.salesRepUserId,
        specialRequests: source.specialRequests,
        groupComments: source.groupComments,
        reservationComments: source.reservationComments,
        autoReleaseAtCutoff: source.autoReleaseAtCutoff,
        shoulderDatesEnabled: source.shoulderDatesEnabled,
        shoulderStartDate: source.shoulderStartDate,
        shoulderEndDate: source.shoulderEndDate,
        shoulderRateCents: source.shoulderRateCents,
        autoRoutePackagesToMaster: source.autoRoutePackagesToMaster,
        autoRouteSpecialsToMaster: source.autoRouteSpecialsToMaster,
        totalRoomsBlocked: 0,
        roomsPickedUp: 0,
        version: 1,
        createdBy: ctx.user.id,
      })
      .returning();

    // Copy room blocks if requested
    if (input.copyBlocks) {
      const sourceStart = new Date(source.startDate);
      const newStart = new Date(input.newStartDate);
      const offsetDays = Math.round(
        (newStart.getTime() - sourceStart.getTime()) / (1000 * 60 * 60 * 24),
      );

      const blockRows = await tx.execute(sql`
        SELECT room_type_id, block_date, rooms_blocked
        FROM pms_group_room_blocks
        WHERE tenant_id = ${ctx.tenantId}
          AND group_id = ${sourceGroupId}
          AND released = false
      `);
      const blocks = Array.from(blockRows as Iterable<Record<string, unknown>>);

      let total = 0;
      for (const block of blocks) {
        const origDate = new Date(String(block.block_date));
        const newDate = new Date(origDate);
        newDate.setDate(newDate.getDate() + offsetDays);
        const newDateStr = newDate.toISOString().split('T')[0]!;
        const roomsBlocked = Number(block.rooms_blocked ?? 0);

        await tx.execute(sql`
          INSERT INTO pms_group_room_blocks (id, tenant_id, group_id, room_type_id, block_date, rooms_blocked, rooms_picked_up)
          VALUES (${generateUlid()}, ${ctx.tenantId}, ${newGroupId}, ${block.room_type_id}, ${newDateStr}, ${roomsBlocked}, 0)
        `);
        total += roomsBlocked;
      }

      if (total > 0) {
        await tx
          .update(pmsGroups)
          .set({ totalRoomsBlocked: total, updatedAt: new Date() })
          .where(and(eq(pmsGroups.id, newGroupId), eq(pmsGroups.tenantId, ctx.tenantId)));
      }
    }

    await pmsAuditLogEntry(tx, ctx, source.propertyId, 'group', newGroupId, 'created_from_copy', {
      sourceGroupId,
      newName: input.newName,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.GROUP_COPIED, {
      sourceGroupId,
      newGroupId,
      propertyId: source.propertyId,
      newName: input.newName,
      newStartDate: input.newStartDate,
      newEndDate: input.newEndDate,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'pms.copyGroup', newGroup!);
    }

    return { result: { newGroupId, confirmationNumber }, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.group.copied', 'pms_group', result.newGroupId);
  return result;
}
