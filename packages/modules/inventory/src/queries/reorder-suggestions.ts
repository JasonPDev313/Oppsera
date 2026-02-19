import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { inventoryItems, itemVendors, vendors } from '@oppsera/db';

export interface ReorderSuggestion {
  id: string;
  name: string;
  sku: string | null;
  onHand: number;
  reorderPoint: number;
  reorderQuantity: number | null;
  parLevel: number | null;
  suggestedOrderQty: number;
  preferredVendorId: string | null;
  preferredVendorName: string | null;
  vendorCost: number | null;
}

/**
 * Items where on-hand ≤ reorderPoint at a given location.
 * Includes preferred vendor info for quick receipt creation.
 */
export async function getReorderSuggestions(
  tenantId: string,
  locationId: string,
): Promise<ReorderSuggestion[]> {
  return withTenant(tenantId, async (tx) => {
    // Get items with reorder point set
    const items = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.tenantId, tenantId),
          eq(inventoryItems.locationId, locationId),
          eq(inventoryItems.status, 'active'),
          sql`${inventoryItems.reorderPoint} IS NOT NULL`,
        ),
      );

    if (items.length === 0) return [];

    // Get on-hand for all items
    const itemIds = items.map((i) => i.id);
    const idList = sql.join(itemIds.map((id) => sql`${id}`), sql`, `);
    const onHandRows = await tx.execute(
      sql`SELECT inventory_item_id, COALESCE(SUM(quantity_delta), 0) as on_hand
          FROM inventory_movements
          WHERE tenant_id = ${tenantId}
            AND inventory_item_id IN (${idList})
          GROUP BY inventory_item_id`,
    );
    const onHandMap = new Map<string, number>();
    const arr = Array.from(onHandRows as Iterable<{ inventory_item_id: string; on_hand: string }>);
    for (const r of arr) {
      onHandMap.set(r.inventory_item_id, parseFloat(r.on_hand));
    }

    // Filter to items at/below reorder point
    const belowReorder = items.filter((item) => {
      const onHand = onHandMap.get(item.id) ?? 0;
      const reorderPoint = Number(item.reorderPoint);
      return onHand <= reorderPoint;
    });

    if (belowReorder.length === 0) return [];

    // Get preferred vendor for each item
    const belowIds = belowReorder.map((i) => i.id);
    const belowIdList = sql.join(belowIds.map((id) => sql`${id}`), sql`, `);
    const vendorRows = await tx
      .select({
        iv: itemVendors,
        vendorName: vendors.name,
      })
      .from(itemVendors)
      .innerJoin(vendors, eq(itemVendors.vendorId, vendors.id))
      .where(
        and(
          eq(itemVendors.tenantId, tenantId),
          eq(itemVendors.isPreferred, true),
          sql`${itemVendors.inventoryItemId} IN (${belowIdList})`,
        ),
      );

    const vendorMap = new Map<string, { vendorId: string; vendorName: string; vendorCost: number | null }>();
    for (const r of vendorRows) {
      vendorMap.set(r.iv.inventoryItemId, {
        vendorId: r.iv.vendorId,
        vendorName: r.vendorName,
        vendorCost: r.iv.vendorCost ? Number(r.iv.vendorCost) : null,
      });
    }

    return belowReorder.map((item) => {
      const onHand = onHandMap.get(item.id) ?? 0;
      const reorderPoint = Number(item.reorderPoint);
      const reorderQty = item.reorderQuantity ? Number(item.reorderQuantity) : null;
      const parLevel = item.parLevel ? Number(item.parLevel) : null;

      // Suggested qty: reorderQuantity if set, else (parLevel - onHand) if parLevel set, else (reorderPoint - onHand + 1)
      const suggestedOrderQty = reorderQty
        ? reorderQty
        : parLevel
          ? Math.max(0, parLevel - onHand)
          : Math.max(1, reorderPoint - onHand + 1);

      const vendor = vendorMap.get(item.id);

      return {
        id: item.id,
        name: item.name,
        sku: item.sku ?? null,
        onHand,
        reorderPoint,
        reorderQuantity: reorderQty,
        parLevel,
        suggestedOrderQty,
        preferredVendorId: vendor?.vendorId ?? null,
        preferredVendorName: vendor?.vendorName ?? null,
        vendorCost: vendor?.vendorCost ?? null,
      };
    });
  });
}
