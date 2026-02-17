import { eq, and, sql } from 'drizzle-orm';
import { inventoryMovements } from '@oppsera/db';

/**
 * Calculate current on-hand quantity for an inventory item
 * by summing all movement deltas. Returns 0 if no movements exist.
 */
export async function getOnHand(
  tx: any,
  tenantId: string,
  inventoryItemId: string,
): Promise<number> {
  const result = await tx
    .select({ total: sql<string>`COALESCE(SUM(${inventoryMovements.quantityDelta}), 0)` })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.tenantId, tenantId),
        eq(inventoryMovements.inventoryItemId, inventoryItemId),
      ),
    );
  return parseFloat(result[0]?.total ?? '0');
}
