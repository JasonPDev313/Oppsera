import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { inventoryItems, inventoryMovements } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

type InventoryItem = typeof inventoryItems.$inferSelect;

export interface InventoryItemDetail extends InventoryItem {
  onHand: number;
}

export async function getInventoryItem(
  tenantId: string,
  inventoryItemId: string,
): Promise<InventoryItemDetail> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select().from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.tenantId, tenantId),
          eq(inventoryItems.id, inventoryItemId),
        ),
      );

    const item = rows[0];
    if (!item) throw new NotFoundError('Inventory item not found');

    // Compute on-hand
    const onHandResult = await tx
      .select({
        total: sql<string>`COALESCE(SUM(${inventoryMovements.quantityDelta}), 0)`,
      })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.tenantId, tenantId),
          eq(inventoryMovements.inventoryItemId, inventoryItemId),
        ),
      );

    const onHand = parseFloat(onHandResult[0]?.total ?? '0');

    return { ...item, onHand };
  });
}
