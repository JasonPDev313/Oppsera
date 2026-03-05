import { eq, and, lt, desc, ilike, isNotNull, sql, type SQL } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { inventoryItems } from '@oppsera/db';

type InventoryItem = typeof inventoryItems.$inferSelect;

export interface ListInventoryItemsInput {
  tenantId: string;
  locationId?: string;
  status?: string; // 'active', 'discontinued', 'archived'
  itemType?: string;
  search?: string; // search by name or SKU
  lowStockOnly?: boolean; // filter to items at or below reorder point
  cursor?: string;
  limit?: number;
}

export interface InventoryItemWithOnHand extends InventoryItem {
  onHand: number;
}

export interface ListInventoryItemsResult {
  items: InventoryItemWithOnHand[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listInventoryItems(input: ListInventoryItemsInput): Promise<ListInventoryItemsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    // Build WHERE conditions using Drizzle query builder for proper camelCase mapping.
    // The lowStockOnly subquery is injected as a raw SQL condition.
    const conditions: SQL[] = [
      eq(inventoryItems.tenantId, input.tenantId),
    ];

    if (input.locationId) conditions.push(eq(inventoryItems.locationId, input.locationId));
    if (input.status) conditions.push(eq(inventoryItems.status, input.status));
    if (input.itemType) conditions.push(eq(inventoryItems.itemType, input.itemType));
    if (input.cursor) conditions.push(lt(inventoryItems.id, input.cursor));
    if (input.search) {
      conditions.push(
        sql`(${ilike(inventoryItems.name, `%${input.search}%`)} OR ${ilike(inventoryItems.sku, `%${input.search}%`)})`,
      );
    }

    // Move low-stock filter into the WHERE clause so pagination is correct.
    // The subquery computes on-hand per item and compares against reorder_point.
    if (input.lowStockOnly) {
      conditions.push(isNotNull(inventoryItems.reorderPoint));
      conditions.push(
        sql`COALESCE((
          SELECT SUM(quantity_delta)
          FROM inventory_movements
          WHERE tenant_id = ${input.tenantId}
            AND inventory_item_id = ${inventoryItems.id}
        ), 0) <= ${inventoryItems.reorderPoint}::numeric`,
      );
    }

    const rows = await tx
      .select()
      .from(inventoryItems)
      .where(and(...conditions))
      .orderBy(desc(inventoryItems.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Compute on-hand for each item via SUM
    const itemIds = items.map((i) => i.id);
    const onHandMap = new Map<string, number>();

    if (itemIds.length > 0) {
      const idList = sql.join(itemIds.map((id) => sql`${id}`), sql`, `);
      const onHandRows = await tx.execute(
        sql`SELECT inventory_item_id, COALESCE(SUM(quantity_delta), 0) as on_hand
            FROM inventory_movements
            WHERE tenant_id = ${input.tenantId}
              AND inventory_item_id IN (${idList})
            GROUP BY inventory_item_id`,
      );
      const onHandArr = Array.from(onHandRows as Iterable<{ inventory_item_id: string; on_hand: string }>);
      for (const row of onHandArr) {
        onHandMap.set(row.inventory_item_id, parseFloat(row.on_hand));
      }
    }

    const enriched: InventoryItemWithOnHand[] = items.map((item) => ({
      ...item,
      onHand: onHandMap.get(item.id) ?? 0,
    }));

    return {
      items: enriched,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
