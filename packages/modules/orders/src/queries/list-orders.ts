import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { orders } from '@oppsera/db';

export interface ListOrdersInput {
  tenantId: string;
  locationId: string;
  cursor?: string;
  limit?: number;
  status?: string;
  businessDate?: string;
}

export interface ListOrdersResult {
  orders: (typeof orders.$inferSelect)[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listOrders(input: ListOrdersInput): Promise<ListOrdersResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(orders.tenantId, input.tenantId),
      eq(orders.locationId, input.locationId),
    ];

    if (input.cursor) {
      conditions.push(lt(orders.id, input.cursor));
    }

    if (input.status) {
      conditions.push(eq(orders.status, input.status));
    }

    if (input.businessDate) {
      conditions.push(eq(orders.businessDate, input.businessDate));
    }

    const rows = await tx
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { orders: items, cursor: nextCursor, hasMore };
  });
}
