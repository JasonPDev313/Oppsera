import { eq, and, lt, desc, sql } from 'drizzle-orm';
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
    // Build the query with on-hand subquery
    // We use a raw SQL approach for the SUM join since Drizzle's subquery support is complex
    const conditions: ReturnType<typeof eq>[] = [
      eq(inventoryItems.tenantId, input.tenantId),
    ];

    if (input.locationId) conditions.push(eq(inventoryItems.locationId, input.locationId));
    if (input.status) conditions.push(eq(inventoryItems.status, input.status));
    if (input.itemType) conditions.push(eq(inventoryItems.itemType, input.itemType));
    if (input.cursor) conditions.push(lt(inventoryItems.id, input.cursor));
    if (input.search) {
      // Search by name or SKU (case-insensitive)
      conditions.push(
        sql`(${inventoryItems.name} ILIKE ${'%' + input.search + '%'} OR ${inventoryItems.sku} ILIKE ${'%' + input.search + '%'})`,
      );
    }

    const rows = await tx.select().from(inventoryItems)
      .where(and(...conditions))
      .orderBy(desc(inventoryItems.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Compute on-hand for each item via SUM
    const itemIds = items.map((i: InventoryItem) => i.id);
    const onHandMap = new Map<string, number>();

    if (itemIds.length > 0) {
      // Use raw SQL for the aggregate query
      const onHandRows = await tx.execute(
        sql`SELECT inventory_item_id, COALESCE(SUM(quantity_delta), 0) as on_hand
            FROM inventory_movements
            WHERE tenant_id = ${input.tenantId}
              AND inventory_item_id = ANY(${itemIds})
            GROUP BY inventory_item_id`
      );
      const onHandArr = Array.from(onHandRows as Iterable<{ inventory_item_id: string; on_hand: string }>);
      for (const row of onHandArr) {
        onHandMap.set(row.inventory_item_id, parseFloat(row.on_hand));
      }
    }

    let enriched: InventoryItemWithOnHand[] = items.map((item: InventoryItem) => ({
      ...item,
      onHand: onHandMap.get(item.id) ?? 0,
    }));

    // Filter low stock if requested (post-query filter since it requires computed on-hand)
    if (input.lowStockOnly) {
      enriched = enriched.filter((item) => {
        const reorderPoint = item.reorderPoint ? parseFloat(item.reorderPoint) : null;
        return reorderPoint !== null && item.onHand <= reorderPoint;
      });
    }

    return {
      items: enriched,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
