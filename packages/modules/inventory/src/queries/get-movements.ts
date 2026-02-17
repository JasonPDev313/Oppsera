import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { inventoryMovements } from '@oppsera/db';

type InventoryMovement = typeof inventoryMovements.$inferSelect;

export interface GetMovementsInput {
  tenantId: string;
  inventoryItemId: string;
  movementType?: string;
  source?: string;
  cursor?: string;
  limit?: number;
}

export interface GetMovementsResult {
  movements: InventoryMovement[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getMovements(input: GetMovementsInput): Promise<GetMovementsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(inventoryMovements.tenantId, input.tenantId),
      eq(inventoryMovements.inventoryItemId, input.inventoryItemId),
    ];

    if (input.movementType) conditions.push(eq(inventoryMovements.movementType, input.movementType));
    if (input.source) conditions.push(eq(inventoryMovements.source, input.source));
    if (input.cursor) conditions.push(lt(inventoryMovements.id, input.cursor));

    const rows = await tx.select().from(inventoryMovements)
      .where(and(...conditions))
      .orderBy(desc(inventoryMovements.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      movements: items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
