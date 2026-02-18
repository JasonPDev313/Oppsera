import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { inventoryItems } from '@oppsera/db';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import type { ArchiveInventoryItemInput } from '../validation';

export async function archiveInventoryItem(ctx: RequestContext, input: ArchiveInventoryItemInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [item] = await (tx as any)
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, input.inventoryItemId), eq(inventoryItems.tenantId, ctx.tenantId)))
      .limit(1);

    if (!item) throw new NotFoundError('InventoryItem', input.inventoryItemId);
    if (item.status === 'archived') throw new ValidationError('Item is already archived');

    const newStatus = input.archive ? 'archived' : 'active';

    await (tx as any)
      .update(inventoryItems)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(inventoryItems.id, input.inventoryItemId));

    const event = buildEventFromContext(ctx, 'inventory.item.status_changed.v1', {
      inventoryItemId: input.inventoryItemId,
      previousStatus: item.status,
      newStatus,
    });

    return { result: { inventoryItemId: input.inventoryItemId, status: newStatus }, events: [event] };
  });

  await auditLog(ctx, input.archive ? 'inventory.item.archived' : 'inventory.item.unarchived', 'inventory_item', input.inventoryItemId);
  return result;
}
