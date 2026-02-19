import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { ArchiveItemInput } from '../validation';
import { catalogItems } from '../schema';
import { logItemChange } from '../services/item-change-log';

export async function archiveItem(ctx: RequestContext, itemId: string, input: ArchiveItemInput) {
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

    // Idempotent: already archived → return as-is
    if (existing.archivedAt) {
      return { result: existing, events: [] };
    }

    const [updated] = await tx
      .update(catalogItems)
      .set({
        archivedAt: new Date(),
        archivedBy: ctx.user.id,
        archivedReason: input.reason ?? null,
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
      actionType: 'ARCHIVED',
      source: 'UI',
      summary: 'Archived item',
      notes: input.reason ?? undefined,
    });

    const event = buildEventFromContext(ctx, 'catalog.item.archived.v1', {
      itemId,
      name: existing.name,
      sku: existing.sku,
      reason: input.reason ?? null,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'catalog.item.archived', 'catalog_item', itemId);

  return item;
}
