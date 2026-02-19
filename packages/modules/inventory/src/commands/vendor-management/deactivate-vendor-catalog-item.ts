import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { itemVendors } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

export async function deactivateVendorCatalogItem(
  ctx: RequestContext,
  itemVendorId: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await (tx as any)
      .select()
      .from(itemVendors)
      .where(and(eq(itemVendors.tenantId, ctx.tenantId), eq(itemVendors.id, itemVendorId)));
    if (!rows[0]) throw new NotFoundError('Vendor catalog item');

    const [updated] = await (tx as any)
      .update(itemVendors)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(itemVendors.id, itemVendorId))
      .returning();

    const event = buildEventFromContext(ctx, 'inventory.vendor_catalog.deactivated.v1', {
      itemVendorId: updated.id,
      vendorId: rows[0].vendorId,
      inventoryItemId: rows[0].inventoryItemId,
    });
    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'inventory.vendor_catalog.deactivated', 'item_vendor', itemVendorId);
  return result;
}
