import { eq, and, lt, desc, gte, lte, sql, isNotNull } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { orders, customers } from '@oppsera/db';

export interface ListHeldOrdersInput {
  tenantId: string;
  locationId: string;
  cursor?: string;
  limit?: number;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface HeldOrderRow {
  id: string;
  orderNumber: string;
  itemCount: number;
  total: number;
  heldAt: string;
  heldBy: string;
  customerName: string | null;
  employeeId: string | null;
}

export interface ListHeldOrdersResult {
  orders: HeldOrderRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listHeldOrders(input: ListHeldOrdersInput): Promise<ListHeldOrdersResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(orders.tenantId, input.tenantId),
      eq(orders.locationId, input.locationId),
      eq(orders.status, 'open'),
      isNotNull(orders.heldAt),
    ];

    if (input.cursor) {
      conditions.push(lt(orders.id, input.cursor));
    }

    if (input.employeeId) {
      conditions.push(eq(orders.heldBy, input.employeeId));
    }

    if (input.dateFrom) {
      conditions.push(gte(orders.heldAt, new Date(input.dateFrom)));
    }

    if (input.dateTo) {
      conditions.push(lte(orders.heldAt, new Date(input.dateTo + 'T23:59:59.999Z')));
    }

    const rows = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        total: orders.total,
        heldAt: orders.heldAt,
        heldBy: orders.heldBy,
        employeeId: orders.employeeId,
        customerName: customers.displayName,
        itemCount: sql<number>`(
          SELECT count(*)::int FROM order_lines
          WHERE order_lines.order_id = ${orders.id}
        )`,
      })
      .from(orders)
      .leftJoin(
        customers,
        and(
          eq(customers.id, orders.customerId),
          eq(customers.tenantId, orders.tenantId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(orders.heldAt), desc(orders.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    const result: HeldOrderRow[] = items.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      itemCount: row.itemCount ?? 0,
      total: row.total,
      heldAt: row.heldAt?.toISOString() ?? '',
      heldBy: row.heldBy ?? '',
      customerName: row.customerName ?? null,
      employeeId: row.employeeId ?? null,
    }));

    return { orders: result, cursor: nextCursor, hasMore };
  });
}
