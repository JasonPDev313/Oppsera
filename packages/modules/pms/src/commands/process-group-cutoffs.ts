import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

/**
 * Auto-release group blocks when cutoff date has passed.
 * Called by the night audit / scheduled cron job.
 */
export async function processGroupCutoffs(
  ctx: RequestContext,
  propertyId: string,
  businessDate: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find groups where cutoff has passed and auto-release is enabled
    const groupRows = await tx.execute(sql`
      SELECT id, name, property_id
      FROM pms_groups
      WHERE tenant_id = ${ctx.tenantId}
        AND property_id = ${propertyId}
        AND auto_release_at_cutoff = true
        AND status NOT IN ('cancelled')
        AND cutoff_date IS NOT NULL
        AND cutoff_date <= ${businessDate}
        AND total_rooms_blocked > 0
    `);

    const groups = Array.from(groupRows as Iterable<Record<string, unknown>>);
    const events = [];
    let totalGroupsProcessed = 0;

    for (const group of groups) {
      const groupId = String(group.id);

      // Count unreleased blocks before release
      const countRows = await tx.execute(sql`
        SELECT COUNT(*) AS block_count
        FROM pms_group_room_blocks
        WHERE tenant_id = ${ctx.tenantId}
          AND group_id = ${groupId}
          AND released = false
      `);
      const countArr = Array.from(countRows as Iterable<Record<string, unknown>>);
      const releasedBlockCount = Number(countArr[0]?.block_count ?? 0);

      if (releasedBlockCount === 0) continue;

      // Release all unreleased blocks
      await tx.execute(sql`
        UPDATE pms_group_room_blocks
        SET released = true, updated_at = now()
        WHERE tenant_id = ${ctx.tenantId}
          AND group_id = ${groupId}
          AND released = false
      `);

      // Update group totalRoomsBlocked to 0
      await tx.execute(sql`
        UPDATE pms_groups
        SET total_rooms_blocked = 0, updated_at = now()
        WHERE tenant_id = ${ctx.tenantId} AND id = ${groupId}
      `);

      await pmsAuditLogEntry(tx, ctx, String(group.property_id), 'group', groupId, 'blocks_auto_released', {
        businessDate,
        releasedBlockCount,
      });

      events.push(buildEventFromContext(ctx, PMS_EVENTS.GROUP_BLOCKS_AUTO_RELEASED, {
        groupId,
        propertyId: String(group.property_id),
        name: String(group.name),
        businessDate,
        releasedBlockCount,
      }));

      totalGroupsProcessed++;
    }

    return { result: { propertyId, businessDate, totalGroupsProcessed }, events };
  });

  auditLogDeferred(ctx, 'pms.group.cutoffs_processed', 'pms_property', propertyId);
  return result;
}
