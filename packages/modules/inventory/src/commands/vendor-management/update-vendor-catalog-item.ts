import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { itemVendors } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateVendorCatalogItemInput } from '../../validation/vendor-management';

export async function updateVendorCatalogItem(
  ctx: RequestContext,
  input: UpdateVendorCatalogItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await (tx as any)
      .select()
      .from(itemVendors)
      .where(and(eq(itemVendors.tenantId, ctx.tenantId), eq(itemVendors.id, input.itemVendorId)));
    if (!rows[0]) throw new NotFoundError('Vendor catalog item');

    const current = rows[0];
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.vendorSku !== undefined) updates.vendorSku = input.vendorSku;
    if (input.vendorCost !== undefined) updates.vendorCost = input.vendorCost?.toString() ?? null;
    if (input.leadTimeDays !== undefined) updates.leadTimeDays = input.leadTimeDays;
    if (input.minOrderQty !== undefined) updates.minOrderQty = input.minOrderQty?.toString() ?? null;
    if (input.packSize !== undefined) updates.packSize = input.packSize;
    if (input.notes !== undefined) updates.notes = input.notes;

    // Handle preferred vendor toggle — enforce single preferred per item
    if (input.isPreferred === true && !current.isPreferred) {
      await (tx as any)
        .update(itemVendors)
        .set({ isPreferred: false, updatedAt: new Date() })
        .where(
          and(
            eq(itemVendors.tenantId, ctx.tenantId),
            eq(itemVendors.inventoryItemId, current.inventoryItemId),
            eq(itemVendors.isActive, true),
          ),
        );
      updates.isPreferred = true;
    } else if (input.isPreferred === false) {
      updates.isPreferred = false;
    }

    const [updated] = await (tx as any)
      .update(itemVendors)
      .set(updates)
      .where(eq(itemVendors.id, input.itemVendorId))
      .returning();

    const event = buildEventFromContext(ctx, 'inventory.vendor_catalog.updated.v1', {
      itemVendorId: updated.id,
      vendorId: current.vendorId,
      inventoryItemId: current.inventoryItemId,
      changes: Object.keys(updates).filter((k) => k !== 'updatedAt'),
    });
    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'inventory.vendor_catalog.updated', 'item_vendor', input.itemVendorId);
  return result;
}
