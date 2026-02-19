import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogItems } from '../schema';
import { logItemChange } from '../services/item-change-log';

export async function unarchiveItem(ctx: RequestContext, itemId: string) {
  const item = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(catalogItems)
      .where(
        and(eq(catalogItems.id, itemId), eq(catalogItems.tenantId, ctx.tenantId)),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Catalog item', itemId);
    }

    // Idempotent: not archived → return as-is
    if (!existing.archivedAt) {
      return { result: existing, events: [] };
    }

    const [updated] = await tx
      .update(catalogItems)
      .set({
        archivedAt: null,
        archivedBy: null,
        archivedReason: null,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(catalogItems.id, itemId))
      .returning();

    await logItemChange(tx, {
      tenantId: ctx.tenantId,
      itemId,
      before: existing,
      after: updated!,
      userId: ctx.user.id,
      actionType: 'RESTORED',
      source: 'UI',
      summary: 'Restored item',
    });

    const event = buildEventFromContext(ctx, 'catalog.item.unarchived.v1', {
      itemId,
      name: existing.name,
      sku: existing.sku,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'catalog.item.unarchived', 'catalog_item', itemId);

  return item;
}
