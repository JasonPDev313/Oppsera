import { eq, and, ilike, asc, desc } from 'drizzle-orm';
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
 * Supports filtering by location, below-threshold-only, and text search on item name.
 */
export async function getInventorySummary(
  input: GetInventorySummaryInput,
): Promise<InventorySummaryRow[]> {
  return withTenant(input.tenantId, async (tx) => {
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

    return rows;
  });
}
