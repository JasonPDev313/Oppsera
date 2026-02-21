import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { fnbTables } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateTableInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { TableNotFoundError } from '../errors';

export async function updateTable(
  ctx: RequestContext,
  tableId: string,
  input: UpdateTableInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any)
      .select()
      .from(fnbTables)
      .where(and(
        eq(fnbTables.id, tableId),
        eq(fnbTables.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!existing) throw new TableNotFoundError(tableId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const changes: Record<string, unknown> = {};

    if (input.displayLabel !== undefined && input.displayLabel !== existing.displayLabel) {
      updates.displayLabel = input.displayLabel;
      changes.displayLabel = { old: existing.displayLabel, new: input.displayLabel };
    }
    if (input.capacityMin !== undefined && input.capacityMin !== existing.capacityMin) {
      updates.capacityMin = input.capacityMin;
      changes.capacityMin = { old: existing.capacityMin, new: input.capacityMin };
    }
    if (input.capacityMax !== undefined && input.capacityMax !== existing.capacityMax) {
      updates.capacityMax = input.capacityMax;
      changes.capacityMax = { old: existing.capacityMax, new: input.capacityMax };
    }
    if (input.tableType !== undefined && input.tableType !== existing.tableType) {
      updates.tableType = input.tableType;
      changes.tableType = { old: existing.tableType, new: input.tableType };
    }
    if (input.shape !== undefined && input.shape !== existing.shape) {
      updates.shape = input.shape;
      changes.shape = { old: existing.shape, new: input.shape };
    }
    if (input.isCombinable !== undefined && input.isCombinable !== existing.isCombinable) {
      updates.isCombinable = input.isCombinable;
      changes.isCombinable = { old: existing.isCombinable, new: input.isCombinable };
    }
    if (input.sectionId !== undefined && input.sectionId !== existing.sectionId) {
      updates.sectionId = input.sectionId;
      changes.sectionId = { old: existing.sectionId, new: input.sectionId };
    }
    if (input.sortOrder !== undefined && input.sortOrder !== existing.sortOrder) {
      updates.sortOrder = input.sortOrder;
      changes.sortOrder = { old: existing.sortOrder, new: input.sortOrder };
    }

    if (Object.keys(changes).length === 0) {
      return { result: existing, events: [] };
    }

    const [updated] = await (tx as any)
      .update(fnbTables)
      .set(updates)
      .where(eq(fnbTables.id, tableId))
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.TABLE_UPDATED, {
      tableId,
      roomId: existing.roomId,
      locationId: existing.locationId,
      changes,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.table.updated', 'fnb_tables', tableId);
  return result;
}
