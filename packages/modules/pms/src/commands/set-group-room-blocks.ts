import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsGroups, pmsGroupRoomBlocks } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { SetGroupRoomBlocksInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function setGroupRoomBlocks(ctx: RequestContext, input: SetGroupRoomBlocksInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate group exists and belongs to tenant
    const [group] = await tx
      .select()
      .from(pmsGroups)
      .where(
        and(
          eq(pmsGroups.id, input.groupId),
          eq(pmsGroups.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!group) {
      throw new NotFoundError('Group', input.groupId);
    }

    // Upsert room blocks: ON CONFLICT (tenant_id, group_id, room_type_id, block_date) DO UPDATE
    let totalRoomsBlocked = 0;
    for (const block of input.blocks) {
      const blockId = generateUlid();
      await tx.execute(sql`
        INSERT INTO pms_group_room_blocks (id, tenant_id, group_id, room_type_id, block_date, rooms_blocked)
        VALUES (${blockId}, ${ctx.tenantId}, ${input.groupId}, ${block.roomTypeId}, ${block.blockDate}, ${block.roomsBlocked})
        ON CONFLICT (tenant_id, group_id, room_type_id, block_date)
        DO UPDATE SET rooms_blocked = ${block.roomsBlocked}, updated_at = now()
      `);
      totalRoomsBlocked += block.roomsBlocked;
    }

    // Recompute total rooms blocked from the actual blocks table
    const totalRows = await tx.execute(sql`
      SELECT COALESCE(SUM(rooms_blocked), 0) AS total
      FROM pms_group_room_blocks
      WHERE tenant_id = ${ctx.tenantId}
        AND group_id = ${input.groupId}
        AND released = false
    `);
    const totalArr = Array.from(totalRows as Iterable<Record<string, unknown>>);
    const computedTotal = Number(totalArr[0]?.total ?? 0);

    // Update group's totalRoomsBlocked
    await tx
      .update(pmsGroups)
      .set({ totalRoomsBlocked: computedTotal, updatedAt: new Date() })
      .where(and(eq(pmsGroups.id, input.groupId), eq(pmsGroups.tenantId, ctx.tenantId)));

    await pmsAuditLogEntry(tx, ctx, group.propertyId, 'group', input.groupId, 'blocks_set', {
      blocksCount: { before: null, after: input.blocks.length },
      totalRoomsBlocked: { before: group.totalRoomsBlocked, after: computedTotal },
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.GROUP_BLOCKS_SET, {
      groupId: input.groupId,
      propertyId: group.propertyId,
      blocksCount: input.blocks.length,
      totalRoomsBlocked: computedTotal,
    });

    return { result: { groupId: input.groupId, totalRoomsBlocked: computedTotal }, events: [event] };
  });

  await auditLog(ctx, 'pms.group.blocks_set', 'pms_group', input.groupId);

  return result;
}
