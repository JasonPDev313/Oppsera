import { eq, and, lt, desc, asc, ilike, or, gte, lte, sql, getTableColumns, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { orders, customers, tenders } from '@oppsera/db';

export interface ListOrdersInput {
  tenantId: string;
  locationId?: string;
  cursor?: string;
  limit?: number;
  status?: string;
  businessDate?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  paymentMethod?: string;
  employeeId?: string;
  terminalId?: string;
  sortBy?: 'createdAt' | 'total' | 'orderNumber';
  sortDir?: 'asc' | 'desc';
}

export type OrderListRow = typeof orders.$inferSelect & {
  customerName: string | null;
  paymentType: string | null;
  tipTotal: number;
};

export interface ListOrdersResult {
  orders: OrderListRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listOrders(input: ListOrdersInput): Promise<ListOrdersResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(orders.tenantId, input.tenantId),
    ];

    if (input.locationId) {
      conditions.push(eq(orders.locationId, input.locationId));
    }

    if (input.cursor) {
      conditions.push(lt(orders.id, input.cursor));
    }

    if (input.status) {
      conditions.push(eq(orders.status, input.status));
    }

    if (input.businessDate) {
      conditions.push(eq(orders.businessDate, input.businessDate));
    }

    if (input.dateFrom) {
      conditions.push(gte(orders.businessDate, input.dateFrom));
    }

    if (input.dateTo) {
      conditions.push(lte(orders.businessDate, input.dateTo));
    }

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(
        or(
          ilike(orders.orderNumber, pattern),
          ilike(customers.displayName, pattern),
        )!,
      );
    }

    if (input.paymentMethod) {
      conditions.push(
        sql`exists(
          select 1 from tenders
          where tenders.order_id = ${orders.id}
            and tenders.tenant_id = ${input.tenantId}
            and tenders.tender_type = ${input.paymentMethod}
        )`,
      );
    }

    if (input.employeeId) {
      conditions.push(eq(orders.employeeId, input.employeeId));
    }

    if (input.terminalId) {
      conditions.push(eq(orders.terminalId, input.terminalId));
    }

    // Determine sort
    const sortColumnMap = {
      createdAt: orders.createdAt,
      total: orders.total,
      orderNumber: orders.orderNumber,
    } as const;
    const sortColumn = sortColumnMap[input.sortBy ?? 'createdAt'];
    const sortFn = input.sortDir === 'asc' ? asc : desc;

    // Step 1: Fetch orders + customer name (no correlated subqueries)
    const rows = await tx
      .select({
        ...getTableColumns(orders),
        customerName: customers.displayName,
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
      .orderBy(sortFn(sortColumn), desc(orders.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    // Step 2: Batch-fetch tender aggregates for all returned order IDs
    const orderIds = items.map((r) => r.id);
    const tenderMap = new Map<string, { paymentType: string | null; tipTotal: number }>();

    if (orderIds.length > 0) {
      const tenderAggs = await (tx as any)
        .select({
          orderId: tenders.orderId,
          paymentType: sql<string | null>`(array_agg(${tenders.tenderType} order by ${tenders.createdAt} asc))[1]`,
          tipTotal: sql<number>`coalesce(sum(${tenders.tipAmount})::int, 0)`,
        })
        .from(tenders)
        .where(
          and(
            eq(tenders.tenantId, input.tenantId),
            eq(tenders.status, 'captured'),
            inArray(tenders.orderId, orderIds),
          ),
        )
        .groupBy(tenders.orderId);

      for (const agg of tenderAggs as any[]) {
        tenderMap.set(agg.orderId as string, {
          paymentType: agg.paymentType as string | null,
          tipTotal: (agg.tipTotal as number) ?? 0,
        });
      }
    }

    // Step 3: Merge
    const result: OrderListRow[] = items.map((row) => {
      const agg = tenderMap.get(row.id);
      return {
        ...row,
        paymentType: agg?.paymentType ?? null,
        tipTotal: agg?.tipTotal ?? 0,
      } as OrderListRow;
    });

    return { orders: result, cursor: nextCursor, hasMore };
  });
}
