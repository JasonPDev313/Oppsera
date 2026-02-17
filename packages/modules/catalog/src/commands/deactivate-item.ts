import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { catalogItems } from '../schema';

export async function deactivateItem(ctx: RequestContext, itemId: string) {
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

    // Idempotent: already inactive → return as-is
    if (!existing.isActive) {
      return { result: existing, events: [] };
    }

    const [updated] = await tx
      .update(catalogItems)
      .set({
        isActive: false,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(catalogItems.id, itemId))
      .returning();

    const event = buildEventFromContext(ctx, 'catalog.item.deactivated.v1', {
      itemId,
      sku: existing.sku,
      name: existing.name,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'catalog.item.deactivated', 'catalog_item', itemId);

  return item;
}
