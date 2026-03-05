import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import {
  fnbTableLiveStatus,
  fnbTableCombineGroups,
  fnbTableCombineMembers,
} from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UncombineTablesInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { CombineGroupNotFoundError } from '../errors';

export async function uncombineTables(
  ctx: RequestContext,
  input: UncombineTablesInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'uncombineTables',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // Fetch combine group
    const [group] = await tx
      .select()
      .from(fnbTableCombineGroups)
      .where(and(
        eq(fnbTableCombineGroups.id, input.combineGroupId),
        eq(fnbTableCombineGroups.tenantId, ctx.tenantId),
        eq(fnbTableCombineGroups.status, 'active'),
      ))
      .limit(1);

    if (!group) throw new CombineGroupNotFoundError(input.combineGroupId);

    // Get all member table IDs
    const members = await tx
      .select()
      .from(fnbTableCombineMembers)
      .where(eq(fnbTableCombineMembers.combineGroupId, input.combineGroupId));

    const tableIds = members.map((m) => m.tableId);

    // Mark the group as dissolved
    await tx
      .update(fnbTableCombineGroups)
      .set({ status: 'dissolved', updatedAt: new Date() })
      .where(eq(fnbTableCombineGroups.id, input.combineGroupId));

    // Clear combineGroupId on all member tables' live status
    for (const tableId of tableIds) {
      await tx
        .update(fnbTableLiveStatus)
        .set({ combineGroupId: null, updatedAt: new Date() })
        .where(and(
          eq(fnbTableLiveStatus.tableId, tableId),
          eq(fnbTableLiveStatus.tenantId, ctx.tenantId),
        ));
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.TABLE_UNCOMBINED, {
      combineGroupId: input.combineGroupId,
      locationId: group.locationId,
      tableIds,
    });

    const uncombineResult = { combineGroupId: input.combineGroupId, tableIds };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'uncombineTables', uncombineResult);

    return { result: uncombineResult, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.table.uncombined', 'fnb_table_combine_groups', input.combineGroupId);

  return result;
}
