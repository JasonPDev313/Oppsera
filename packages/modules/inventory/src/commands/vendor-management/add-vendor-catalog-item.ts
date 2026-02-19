import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { vendors, itemVendors, inventoryItems } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddVendorCatalogItemInput } from '../../validation/vendor-management';

export async function addVendorCatalogItem(
  ctx: RequestContext,
  input: AddVendorCatalogItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate vendor exists
    const vendorRows = await (tx as any)
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.tenantId, ctx.tenantId), eq(vendors.id, input.vendorId)));
    if (!vendorRows[0]) throw new NotFoundError('Vendor');

    // Validate item exists
    const itemRows = await (tx as any)
      .select({ id: inventoryItems.id, currentCost: inventoryItems.currentCost })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.tenantId, ctx.tenantId), eq(inventoryItems.id, input.inventoryItemId)));
    if (!itemRows[0]) throw new NotFoundError('Inventory item');

    // Check for existing mapping
    const existing = await (tx as any)
      .select()
      .from(itemVendors)
      .where(
        and(
          eq(itemVendors.tenantId, ctx.tenantId),
          eq(itemVendors.inventoryItemId, input.inventoryItemId),
          eq(itemVendors.vendorId, input.vendorId),
        ),
      );

    if (existing[0]) {
      // If inactive, reactivate and update fields
      if (!existing[0].isActive) {
        const vendorCost = input.vendorCost ?? (itemRows[0].currentCost ? Number(itemRows[0].currentCost) : null);
        const [reactivated] = await (tx as any)
          .update(itemVendors)
          .set({
            isActive: true,
            vendorSku: input.vendorSku ?? existing[0].vendorSku,
            vendorCost: vendorCost?.toString() ?? existing[0].vendorCost,
            leadTimeDays: input.leadTimeDays ?? existing[0].leadTimeDays,
            isPreferred: input.isPreferred ?? existing[0].isPreferred,
            minOrderQty: input.minOrderQty?.toString() ?? existing[0].minOrderQty,
            packSize: input.packSize ?? existing[0].packSize,
            notes: input.notes ?? existing[0].notes,
            updatedAt: new Date(),
          })
          .where(eq(itemVendors.id, existing[0].id))
          .returning();

        // Handle preferred vendor toggle
        if (input.isPreferred) {
          await (tx as any)
            .update(itemVendors)
            .set({ isPreferred: false, updatedAt: new Date() })
            .where(
              and(
                eq(itemVendors.tenantId, ctx.tenantId),
                eq(itemVendors.inventoryItemId, input.inventoryItemId),
                eq(itemVendors.isActive, true),
              ),
            );
          await (tx as any)
            .update(itemVendors)
            .set({ isPreferred: true })
            .where(eq(itemVendors.id, reactivated.id));
        }

        const event = buildEventFromContext(ctx, 'inventory.vendor_catalog.reactivated.v1', {
          itemVendorId: reactivated.id,
          vendorId: input.vendorId,
          inventoryItemId: input.inventoryItemId,
        });
        return { result: reactivated, events: [event] };
      }
      // Already active — error
      throw new ValidationError("This item is already in this vendor's catalog");
    }

    // Auto-populate vendor_cost from item's current_cost if not provided
    const vendorCost = input.vendorCost ?? (itemRows[0].currentCost ? Number(itemRows[0].currentCost) : null);

    // Handle preferred vendor: unset others first
    if (input.isPreferred) {
      await (tx as any)
        .update(itemVendors)
        .set({ isPreferred: false, updatedAt: new Date() })
        .where(
          and(
            eq(itemVendors.tenantId, ctx.tenantId),
            eq(itemVendors.inventoryItemId, input.inventoryItemId),
            eq(itemVendors.isActive, true),
          ),
        );
    }

    const [created] = await (tx as any)
      .insert(itemVendors)
      .values({
        tenantId: ctx.tenantId,
        inventoryItemId: input.inventoryItemId,
        vendorId: input.vendorId,
        vendorSku: input.vendorSku ?? null,
        vendorCost: vendorCost?.toString() ?? null,
        leadTimeDays: input.leadTimeDays ?? null,
        isPreferred: input.isPreferred ?? false,
        isActive: true,
        minOrderQty: input.minOrderQty?.toString() ?? null,
        packSize: input.packSize ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'inventory.vendor_catalog.added.v1', {
      itemVendorId: created.id,
      vendorId: input.vendorId,
      inventoryItemId: input.inventoryItemId,
    });
    return { result: created, events: [event] };
  });

  await auditLog(ctx, 'inventory.vendor_catalog.added', 'item_vendor', result.id);
  return result;
}
