import { eq, and, lt, gt, lte, gte, desc, asc, ilike, or, sql, getTableColumns, inArray } from 'drizzle-orm';
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

/**
 * Decode a composite cursor of the form "<sortValue>|<id>".
 * For the default id-only sort, the cursor is just the id.
 */
function decodeCursor(cursor: string): { sortValue: string; id: string } {
  const pipeIdx = cursor.indexOf('|');
  if (pipeIdx === -1) {
    // Legacy / id-only cursor
    return { sortValue: cursor, id: cursor };
  }
  return { sortValue: cursor.slice(0, pipeIdx), id: cursor.slice(pipeIdx + 1) };
}

/**
 * Encode a composite cursor.
 * For the default id sort, emits just the id for backward compatibility.
 */
function encodeCursor(sortBy: string | undefined, sortValue: string | number | Date | null, id: string): string {
  if (!sortBy || sortBy === 'id') return id;
  const sv = sortValue instanceof Date ? sortValue.toISOString() : String(sortValue ?? '');
  return `${sv}|${id}`;
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

    // Composite cursor for stable pagination on any sort field.
    // For id-only (default) sort we keep the simple lt/gt behaviour.
    if (input.cursor) {
      const { sortValue, id } = decodeCursor(input.cursor);
      const dir = input.sortDir === 'asc' ? 'asc' : 'desc';

      if (!input.sortBy || input.sortBy === 'createdAt') {
        // Sort: createdAt [dir], id desc (tiebreaker)
        const sv = new Date(sortValue);
        if (dir === 'desc') {
          // Next page has rows where (createdAt < sv) OR (createdAt = sv AND id < id)
          conditions.push(
            or(
              lt(orders.createdAt, sv),
              and(eq(orders.createdAt, sv), lt(orders.id, id)),
            )!,
          );
        } else {
          conditions.push(
            or(
              gt(orders.createdAt, sv),
              and(eq(orders.createdAt, sv), gt(orders.id, id)),
            )!,
          );
        }
      } else if (input.sortBy === 'total') {
        const sv = Number(sortValue);
        if (dir === 'desc') {
          conditions.push(
            or(
              lt(orders.total, sv),
              and(eq(orders.total, sv), lt(orders.id, id)),
            )!,
          );
        } else {
          conditions.push(
            or(
              gt(orders.total, sv),
              and(eq(orders.total, sv), gt(orders.id, id)),
            )!,
          );
        }
      } else if (input.sortBy === 'orderNumber') {
        if (dir === 'desc') {
          conditions.push(
            or(
              lt(orders.orderNumber, sortValue),
              and(eq(orders.orderNumber, sortValue), lt(orders.id, id)),
            )!,
          );
        } else {
          conditions.push(
            or(
              gt(orders.orderNumber, sortValue),
              and(eq(orders.orderNumber, sortValue), gt(orders.id, id)),
            )!,
          );
        }
      }
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

    // Build composite cursor from the last item's sort field + id
    const lastItem = items[items.length - 1];
    let nextCursor: string | null = null;
    if (hasMore && lastItem) {
      const sortBy = input.sortBy ?? 'createdAt';
      let sortValue: string | number | Date | null = null;
      if (sortBy === 'createdAt') sortValue = lastItem.createdAt;
      else if (sortBy === 'total') sortValue = lastItem.total;
      else if (sortBy === 'orderNumber') sortValue = lastItem.orderNumber;
      nextCursor = encodeCursor(sortBy, sortValue, lastItem.id);
    }

    // Step 2: Batch-fetch tender aggregates for all returned order IDs
    const orderIds = items.map((r) => r.id);
    const tenderMap = new Map<string, { paymentType: string | null; tipTotal: number }>();

    if (orderIds.length > 0) {
      const tenderAggs = await tx
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

      for (const agg of tenderAggs) {
        tenderMap.set(agg.orderId as string, {
          paymentType: agg.paymentType,
          tipTotal: agg.tipTotal ?? 0,
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
