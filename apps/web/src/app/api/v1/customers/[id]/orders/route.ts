import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import type { CustomerOrderEntry, CustomerOrdersResult } from '@/types/customer-360';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

function mapOrderRow(row: Record<string, unknown>): CustomerOrderEntry {
  return {
    id: String(row.id),
    orderNumber: String(row.order_number ?? ''),
    businessDate: row.business_date ? String(row.business_date) : null,
    status: String(row.status),
    orderType: String(row.source ?? 'retail'),
    subtotalCents: Number(row.subtotal ?? 0),
    taxCents: Number(row.tax_total ?? 0),
    totalCents: Number(row.total ?? 0),
    itemCount: Number(row.item_count ?? 0),
    locationId: row.location_id ? String(row.location_id) : null,
    tenderSummary: row.tender_summary ? String(row.tender_summary) : null,
    createdAt: String(row.created_at),
  };
}

// GET /api/v1/customers/:id/orders
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limitParam = url.searchParams.get('limit');
    const statusFilter = url.searchParams.get('status') ?? 'all';

    const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 50);

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const conditions = [
        sql`o.tenant_id = ${ctx.tenantId}`,
        sql`o.customer_id = ${customerId}`,
      ];

      if (statusFilter === 'placed') {
        conditions.push(sql`o.status = 'placed'`);
      } else if (statusFilter === 'voided') {
        conditions.push(sql`o.status = 'voided'`);
      }

      if (cursor) {
        conditions.push(sql`o.id < ${cursor}`);
      }

      const whereClause = sql.join(conditions, sql` AND `);

      const rows = await tx.execute(sql`
        SELECT
          o.id,
          o.order_number,
          o.business_date,
          o.status,
          o.source,
          o.subtotal,
          o.tax_total,
          o.total,
          o.location_id,
          o.created_at,
          (
            SELECT COUNT(*)::int FROM order_lines ol
            WHERE ol.order_id = o.id AND ol.tenant_id = ${ctx.tenantId}
          ) AS item_count,
          (
            SELECT string_agg(DISTINCT t.tender_type, ', ')
            FROM tenders t
            WHERE t.order_id = o.id AND t.tenant_id = ${ctx.tenantId}
              AND t.status != 'reversed'
          ) AS tender_summary
        FROM orders o
        WHERE ${whereClause}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT ${limit + 1}
      `);

      const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
      const hasMore = allRows.length > limit;
      const items = hasMore ? allRows.slice(0, limit) : allRows;

      const data: CustomerOrdersResult = {
        items: items.map(mapOrderRow),
        cursor: hasMore && items.length > 0 ? String(items[items.length - 1]!.id) : null,
        hasMore,
      };

      return data;
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);
