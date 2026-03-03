import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/finance/voids — Voided orders across tenants ──

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
      const conditions: ReturnType<typeof sql>[] = [sql`o.status = 'voided'`];

      if (tenantId) {
        conditions.push(sql`o.tenant_id = ${tenantId}`);
      }
      if (dateFrom) {
        conditions.push(sql`o.voided_at >= ${dateFrom}::timestamptz`);
      }
      if (dateTo) {
        conditions.push(sql`o.voided_at <= ${dateTo}::timestamptz`);
      }
      if (amountMin !== undefined) {
        conditions.push(sql`o.total >= ${amountMin}`);
      }

      const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

      // Count total
      const countResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM orders o
        ${whereClause}
      `);
      const total = Number(
        Array.from(countResult as Iterable<{ total: number }>)[0]?.total ?? 0,
      );

      // Fetch voided orders
      const rows = await tx.execute(sql`
        SELECT
          o.id,
          o.tenant_id,
          o.location_id,
          o.order_number,
          o.source,
          o.subtotal,
          o.tax_total,
          o.discount_total,
          o.total,
          o.void_reason,
          o.voided_by,
          o.voided_at,
          o.business_date,
          o.created_at,
          o.placed_at,
          o.employee_id,
          t.name AS tenant_name,
          l.name AS location_name,
          vb.display_name AS voided_by_name,
          emp.display_name AS employee_name
        FROM orders o
        LEFT JOIN tenants t ON t.id = o.tenant_id
        LEFT JOIN locations l ON l.id = o.location_id
        LEFT JOIN users vb ON vb.id = o.voided_by AND vb.tenant_id = o.tenant_id
        LEFT JOIN users emp ON emp.id = o.employee_id AND emp.tenant_id = o.tenant_id
        ${whereClause}
        ORDER BY o.voided_at DESC
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
