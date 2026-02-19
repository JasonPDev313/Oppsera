import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { inventoryItems, inventoryMovements } from '@oppsera/db';
import type { InventoryItemDetail } from './get-inventory-item';

/**
 * Find an inventory item by catalog item ID + location, returning on-hand.
 * Returns null (not an error) when no inventory record exists.
 */
export async function getInventoryItemByCatalogItem(
  tenantId: string,
  catalogItemId: string,
  locationId: string,
): Promise<InventoryItemDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.tenantId, tenantId),
          eq(inventoryItems.catalogItemId, catalogItemId),
          eq(inventoryItems.locationId, locationId),
        ),
      );

    const item = rows[0];
    if (!item) return null;

    // Compute on-hand
    const onHandResult = await tx
      .select({
        total: sql<string>`COALESCE(SUM(${inventoryMovements.quantityDelta}), 0)`,
      })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.tenantId, tenantId),
          eq(inventoryMovements.inventoryItemId, item.id),
        ),
      );

    const onHand = parseFloat(onHandResult[0]?.total ?? '0');

    return { ...item, onHand };
  });
}
