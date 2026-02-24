import { eq, and, ilike, asc, desc, sql } from 'drizzle-orm';
import { withTenant, rmInventoryOnHand } from '@oppsera/db';

export interface GetInventorySummaryInput {
  tenantId: string;
  locationId?: string;
  belowThresholdOnly?: boolean;
  search?: string;
  sortBy?: 'itemName' | 'onHand';
  sortDir?: 'asc' | 'desc';
}

export interface InventorySummaryRow {
  locationId: string;
  inventoryItemId: string;
  itemName: string;
  onHand: number;
  lowStockThreshold: number;
  isBelowThreshold: boolean;
}

/**
 * Retrieves current inventory snapshot from the read model.
 *
 * Prefers CQRS read model (rm_inventory_on_hand) for speed.
 * Falls back to querying operational tables (inventory_items + inventory_movements)
 * when the read model is empty (e.g., events haven't been consumed yet).
 *
 * Supports filtering by location, below-threshold-only, and text search on item name.
 */
export async function getInventorySummary(
  input: GetInventorySummaryInput,
): Promise<InventorySummaryRow[]> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Try read model first
    const conditions = [eq(rmInventoryOnHand.tenantId, input.tenantId)];

    if (input.locationId) {
      conditions.push(eq(rmInventoryOnHand.locationId, input.locationId));
    }
    if (input.belowThresholdOnly) {
      conditions.push(eq(rmInventoryOnHand.isBelowThreshold, true));
    }
    if (input.search) {
      conditions.push(ilike(rmInventoryOnHand.itemName, `%${input.search}%`));
    }

    const sortColumnMap = {
      itemName: rmInventoryOnHand.itemName,
      onHand: rmInventoryOnHand.onHand,
    } as const;
    const sortColumn = sortColumnMap[input.sortBy ?? 'itemName'];
    const sortFn = input.sortDir === 'desc' ? desc : asc;

    const rows = await tx
      .select({
        locationId: rmInventoryOnHand.locationId,
        inventoryItemId: rmInventoryOnHand.inventoryItemId,
        itemName: rmInventoryOnHand.itemName,
        onHand: rmInventoryOnHand.onHand,
        lowStockThreshold: rmInventoryOnHand.lowStockThreshold,
        isBelowThreshold: rmInventoryOnHand.isBelowThreshold,
      })
      .from(rmInventoryOnHand)
      .where(and(...conditions))
      .orderBy(sortFn(sortColumn));

    if (rows.length > 0) {
      return rows;
    }

    // 2. Fallback: query operational tables when read model is empty
    const locFilter = input.locationId
      ? sql` AND ii.location_id = ${input.locationId}`
      : sql``;
    const searchFilter = input.search
      ? sql` AND ii.name ILIKE ${'%' + input.search + '%'}`
      : sql``;
    const thresholdFilter = input.belowThresholdOnly
      ? sql` AND ii.reorder_point IS NOT NULL AND ii.reorder_point > 0
             AND on_hand.qty < ii.reorder_point`
      : sql``;

    const sortCol = input.sortBy === 'onHand' ? 'on_hand.qty' : 'ii.name';
    const sortDirection = input.sortDir === 'desc' ? sql`DESC` : sql`ASC`;

    const fallbackRows = await tx.execute(sql`
      SELECT
        ii.location_id AS "locationId",
        ii.id AS "inventoryItemId",
        ii.name AS "itemName",
        coalesce(on_hand.qty, 0) AS "onHand",
        coalesce(ii.reorder_point, 0) AS "lowStockThreshold",
        CASE
          WHEN ii.reorder_point IS NOT NULL
            AND ii.reorder_point > 0
            AND coalesce(on_hand.qty, 0) < ii.reorder_point
          THEN true ELSE false
        END AS "isBelowThreshold"
      FROM inventory_items ii
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(im.quantity_delta), 0) AS qty
        FROM inventory_movements im
        WHERE im.inventory_item_id = ii.id
          AND im.tenant_id = ${input.tenantId}
      ) on_hand ON true
      WHERE ii.tenant_id = ${input.tenantId}
        AND ii.status = 'active'
        ${locFilter}
        ${searchFilter}
        ${thresholdFilter}
      ORDER BY ${sql.raw(sortCol)} ${sortDirection}
    `);

    return Array.from(fallbackRows as Iterable<Record<string, unknown>>).map((r) => ({
      locationId: String(r.locationId),
      inventoryItemId: String(r.inventoryItemId),
      itemName: String(r.itemName),
      onHand: Number(r.onHand) || 0,
      lowStockThreshold: Number(r.lowStockThreshold) || 0,
      isBelowThreshold: Boolean(r.isBelowThreshold),
    }));
  });
}
