import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsGroups } from '@oppsera/db';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function releaseGroupBlocks(ctx: RequestContext, groupId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate group exists and belongs to tenant
    const [group] = await tx
      .select()
      .from(pmsGroups)
      .where(
        and(
          eq(pmsGroups.id, groupId),
          eq(pmsGroups.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!group) {
      throw new NotFoundError('Group', groupId);
    }

    // Release all unreleased blocks for this group
    const updateResult = await tx.execute(sql`
      UPDATE pms_group_room_blocks
      SET released = true, updated_at = now()
      WHERE tenant_id = ${ctx.tenantId}
        AND group_id = ${groupId}
        AND released = false
    `);

    // Recompute totalRoomsBlocked (should be 0 since all released)
    const totalRows = await tx.execute(sql`
      SELECT COALESCE(SUM(rooms_blocked), 0) AS total
      FROM pms_group_room_blocks
      WHERE tenant_id = ${ctx.tenantId}
        AND group_id = ${groupId}
        AND released = false
    `);
    const totalArr = Array.from(totalRows as Iterable<Record<string, unknown>>);
    const computedTotal = Number(totalArr[0]?.total ?? 0);

    await tx
      .update(pmsGroups)
      .set({ totalRoomsBlocked: computedTotal, updatedAt: new Date() })
      .where(and(eq(pmsGroups.id, groupId), eq(pmsGroups.tenantId, ctx.tenantId)));

    await pmsAuditLogEntry(tx, ctx, group.propertyId, 'group', groupId, 'blocks_released', {
      previousRoomsBlocked: { before: group.totalRoomsBlocked, after: computedTotal },
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.GROUP_BLOCKS_RELEASED, {
      groupId,
      propertyId: group.propertyId,
      previousRoomsBlocked: group.totalRoomsBlocked,
      remainingRoomsBlocked: computedTotal,
    });

    return { result: { groupId, totalRoomsBlocked: computedTotal }, events: [event] };
  });

  await auditLog(ctx, 'pms.group.blocks_released', 'pms_group', groupId);

  return result;
}
