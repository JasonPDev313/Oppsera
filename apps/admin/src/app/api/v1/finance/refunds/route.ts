import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/finance/refunds — Refund log (tender reversals of type 'refund') ──

export const GET = withAdminPermission(
  async (req) => {
    const sp = new URL(req.url).searchParams;

    const tenantId = sp.get('tenant_id') ?? undefined;
    const dateFrom = sp.get('date_from') ?? undefined;
    const dateTo = sp.get('date_to') ?? undefined;
    const amountMin = sp.get('amount_min') ? Number(sp.get('amount_min')) : undefined;
    const page = Math.max(1, Number(sp.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? '25')));
    const offset = (page - 1) * limit;

    const result = await withAdminDb(async (tx) => {
      const conditions: ReturnType<typeof sql>[] = [sql`tr.reversal_type = 'refund'`];

      if (tenantId) {
        conditions.push(sql`tr.tenant_id = ${tenantId}`);
      }
      if (dateFrom) {
        conditions.push(sql`tr.created_at >= ${dateFrom}::timestamptz`);
      }
      if (dateTo) {
        conditions.push(sql`tr.created_at <= ${dateTo}::timestamptz`);
      }
      if (amountMin !== undefined) {
        conditions.push(sql`tr.amount >= ${amountMin}`);
      }

      const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

      // Count total
      const countResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM tender_reversals tr
        ${whereClause}
      `);
      const total = Number(
        Array.from(countResult as Iterable<{ total: number }>)[0]?.total ?? 0,
      );

      // Fetch refunds with joins
      const rows = await tx.execute(sql`
        SELECT
          tr.id,
          tr.tenant_id,
          tr.location_id,
          tr.original_tender_id,
          tr.order_id,
          tr.reversal_type,
          tr.amount,
          tr.reason,
          tr.refund_method,
          tr.provider_ref,
          tr.status,
          tr.created_at,
          tr.created_by,
          td.tender_type,
          td.card_last4,
          td.card_brand,
          o.order_number,
          o.total AS order_total,
          o.business_date,
          t.name AS tenant_name,
          l.name AS location_name,
          u.display_name AS created_by_name
        FROM tender_reversals tr
        LEFT JOIN tenders td ON td.id = tr.original_tender_id
        LEFT JOIN orders o ON o.id = tr.order_id
        LEFT JOIN tenants t ON t.id = tr.tenant_id
        LEFT JOIN locations l ON l.id = tr.location_id
        LEFT JOIN users u ON u.id = tr.created_by AND u.tenant_id = tr.tenant_id
        ${whereClause}
        ORDER BY tr.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      const items = Array.from(rows as Iterable<Record<string, unknown>>);

      return { items, total, page, limit };
    });

    return NextResponse.json({ data: result });
  },
  { permission: 'tenants.read' },
);
