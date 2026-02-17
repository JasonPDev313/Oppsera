import { eq, and } from 'drizzle-orm';
import { inventoryItems } from '@oppsera/db';

/**
 * Find inventory item by catalog item ID and location.
 * Returns null if not found.
 */
export async function findByCatalogItemId(
  tx: any,
  tenantId: string,
  catalogItemId: string,
  locationId: string,
): Promise<typeof inventoryItems.$inferSelect | null> {
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
  return rows[0] ?? null;
}
