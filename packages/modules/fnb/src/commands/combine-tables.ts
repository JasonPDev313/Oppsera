import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import {
  fnbTables,
  fnbTableLiveStatus,
  fnbTableCombineGroups,
  fnbTableCombineMembers,
} from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CombineTablesInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import {
  TableNotFoundError,
  TableNotCombinableError,
  TableAlreadyCombinedError,
} from '../errors';
import { ValidationError } from '@oppsera/shared';

export async function combineTables(
  ctx: RequestContext,
  input: CombineTablesInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'combineTables',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Validate primary is in the list
    if (!input.tableIds.includes(input.primaryTableId)) {
      throw new ValidationError('primaryTableId must be one of the tableIds');
    }

    // Fetch all tables
    const tables = await (tx as any)
      .select()
      .from(fnbTables)
      .where(and(
        eq(fnbTables.tenantId, ctx.tenantId),
        inArray(fnbTables.id, input.tableIds),
      ));

    if ((tables as any[]).length !== input.tableIds.length) {
      const foundIds = new Set((tables as any[]).map((t: any) => t.id));
      const missing = input.tableIds.find((id) => !foundIds.has(id));
      throw new TableNotFoundError(missing!);
    }

    // Validate all tables are combinable
    for (const table of tables as any[]) {
      if (!table.isCombinable) {
        throw new TableNotCombinableError(table.id);
      }
    }

    // Check none are already in a combine group
    const liveStatuses = await (tx as any)
      .select()
      .from(fnbTableLiveStatus)
      .where(and(
        eq(fnbTableLiveStatus.tenantId, ctx.tenantId),
        inArray(fnbTableLiveStatus.tableId, input.tableIds),
      ));

    for (const ls of liveStatuses as any[]) {
      if (ls.combineGroupId) {
        throw new TableAlreadyCombinedError(ls.tableId);
      }
    }

    // Calculate combined capacity
    const combinedCapacity = (tables as any[]).reduce(
      (sum: number, t: any) => sum + t.capacityMax,
      0,
    );

    const locationId = (tables as any[])[0]!.locationId;

    // Create combine group
    const [group] = await (tx as any)
      .insert(fnbTableCombineGroups)
      .values({
        tenantId: ctx.tenantId,
        locationId,
        primaryTableId: input.primaryTableId,
        combinedCapacity,
        createdBy: ctx.user.id,
      })
      .returning();

    // Create member rows
    for (const tableId of input.tableIds) {
      await (tx as any)
        .insert(fnbTableCombineMembers)
        .values({
          tenantId: ctx.tenantId,
          combineGroupId: group!.id,
          tableId,
          isPrimary: tableId === input.primaryTableId,
        });
    }

    // Update live status for all tables to link to the combine group
    for (const tableId of input.tableIds) {
      await (tx as any)
        .update(fnbTableLiveStatus)
        .set({
          combineGroupId: group!.id,
          updatedAt: new Date(),
        })
        .where(and(
          eq(fnbTableLiveStatus.tableId, tableId),
          eq(fnbTableLiveStatus.tenantId, ctx.tenantId),
        ));
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.TABLE_COMBINED, {
      combineGroupId: group!.id,
      locationId,
      primaryTableId: input.primaryTableId,
      tableIds: input.tableIds,
      combinedCapacity,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'combineTables', group);

    return { result: group!, events: [event] };
  });

  await auditLog(ctx, 'fnb.table.combined', 'fnb_table_combine_groups', result.id, undefined, {
    tableIds: input.tableIds,
    primaryTableId: input.primaryTableId,
  });

  return result;
}
