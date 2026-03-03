import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/finance/orders — Search orders across tenants ──

export const GET = withAdminPermission(
  async (req) => {
    const sp = new URL(req.url).searchParams;

    const tenantId = sp.get('tenant_id') ?? undefined;
    const locationId = sp.get('location_id') ?? undefined;
    const orderNumber = sp.get('order_number') ?? undefined;
    const status = sp.get('status') ?? undefined;
    const businessDateFrom = sp.get('business_date_from') ?? undefined;
    const businessDateTo = sp.get('business_date_to') ?? undefined;
    const amountMin = sp.get('amount_min') ? Number(sp.get('amount_min')) : undefined;
    const amountMax = sp.get('amount_max') ? Number(sp.get('amount_max')) : undefined;
    const hasVoids = sp.get('has_voids') ?? undefined;
    const hasRefunds = sp.get('has_refunds') ?? undefined;
    const sortBy = sp.get('sort_by') ?? 'created_at';
    const sortDir = sp.get('sort_dir') === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(sp.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? '25')));
    const offset = (page - 1) * limit;

    // Validate sort column
    const allowedSorts: Record<string, string> = {
      created_at: 'o.created_at',
      total: 'o.total',
      order_number: 'o.order_number',
    };
    const sortColumn = allowedSorts[sortBy] ?? 'o.created_at';

    const result = await withAdminDb(async (tx) => {
      // Build WHERE conditions
      const conditions: ReturnType<typeof sql>[] = [];

      if (tenantId) {
        conditions.push(sql`o.tenant_id = ${tenantId}`);
      }
      if (locationId) {
        conditions.push(sql`o.location_id = ${locationId}`);
      }
      if (orderNumber) {
        conditions.push(sql`o.order_number ILIKE ${'%' + orderNumber + '%'}`);
      }
      if (status) {
        conditions.push(sql`o.status = ${status}`);
      }
      if (businessDateFrom) {
        conditions.push(sql`o.business_date >= ${businessDateFrom}::date`);
      }
      if (businessDateTo) {
        conditions.push(sql`o.business_date <= ${businessDateTo}::date`);
      }
      if (amountMin !== undefined) {
        conditions.push(sql`o.total >= ${amountMin}`);
      }
      if (amountMax !== undefined) {
        conditions.push(sql`o.total <= ${amountMax}`);
      }
      if (hasVoids === 'true') {
        conditions.push(sql`o.status = 'voided'`);
      }
      if (hasRefunds === 'true') {
        conditions.push(sql`o.return_type IS NOT NULL`);
      }

      const whereClause =
        conditions.length > 0
          ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
          : sql``;

      // Count total
      const countResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM orders o
        ${whereClause}
      `);
      const total = Number(Array.from(countResult as Iterable<{ total: number }>)[0]?.total ?? 0);

      // Fetch items with joins
      const rows = await tx.execute(sql`
        SELECT
          o.id,
          o.tenant_id,
          o.location_id,
          o.order_number,
          o.status,
          o.source,
          o.subtotal,
          o.tax_total,
          o.discount_total,
          o.service_charge_total,
          o.total,
          o.void_reason,
          o.voided_by,
          o.voided_at,
          o.business_date,
          o.created_at,
          o.placed_at,
          o.paid_at,
          o.customer_id,
          o.employee_id,
          o.return_type,
          o.return_order_id,
          t.name AS tenant_name,
          l.name AS location_name,
          u.display_name AS employee_name
        FROM orders o
        LEFT JOIN tenants t ON t.id = o.tenant_id
        LEFT JOIN locations l ON l.id = o.location_id
        LEFT JOIN users u ON u.id = o.employee_id AND u.tenant_id = o.tenant_id
        ${whereClause}
        ORDER BY ${sql.raw(sortColumn)} ${sql.raw(sortDir)}
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
