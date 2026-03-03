import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/finance/chargebacks — Chargeback tracker ──

export const GET = withAdminPermission(
  async (req) => {
    const sp = new URL(req.url).searchParams;

    const tenantId = sp.get('tenant_id') ?? undefined;
    const status = sp.get('status') ?? undefined;
    const dateFrom = sp.get('date_from') ?? undefined;
    const dateTo = sp.get('date_to') ?? undefined;
    const page = Math.max(1, Number(sp.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? '25')));
    const offset = (page - 1) * limit;

    const result = await withAdminDb(async (tx) => {
      const conditions: ReturnType<typeof sql>[] = [];

      if (tenantId) {
        conditions.push(sql`cb.tenant_id = ${tenantId}`);
      }
      if (status) {
        conditions.push(sql`cb.status = ${status}`);
      }
      if (dateFrom) {
        conditions.push(sql`cb.created_at >= ${dateFrom}::timestamptz`);
      }
      if (dateTo) {
        conditions.push(sql`cb.created_at <= ${dateTo}::timestamptz`);
      }

      const whereClause =
        conditions.length > 0
          ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
          : sql``;

      // Count total
      const countResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM chargebacks cb
        ${whereClause}
      `);
      const total = Number(
        Array.from(countResult as Iterable<{ total: number }>)[0]?.total ?? 0,
      );

      // Fetch chargebacks with joins
      const rows = await tx.execute(sql`
        SELECT
          cb.id,
          cb.tenant_id,
          cb.location_id,
          cb.tender_id,
          cb.order_id,
          cb.chargeback_reason,
          cb.chargeback_amount_cents,
          cb.fee_amount_cents,
          cb.status,
          cb.provider_case_id,
          cb.provider_ref,
          cb.customer_id,
          cb.resolution_reason,
          cb.resolution_date,
          cb.business_date,
          cb.created_at,
          cb.resolved_by,
          td.tender_type,
          td.card_last4,
          td.card_brand,
          td.amount AS tender_amount,
          o.order_number,
          o.total AS order_total,
          t.name AS tenant_name,
          l.name AS location_name,
          cust.display_name AS customer_name,
          rb.display_name AS resolved_by_name
        FROM chargebacks cb
        LEFT JOIN tenders td ON td.id = cb.tender_id
        LEFT JOIN orders o ON o.id = cb.order_id
        LEFT JOIN tenants t ON t.id = cb.tenant_id
        LEFT JOIN locations l ON l.id = cb.location_id
        LEFT JOIN customers cust ON cust.id = cb.customer_id AND cust.tenant_id = cb.tenant_id
        LEFT JOIN users rb ON rb.id = cb.resolved_by AND rb.tenant_id = cb.tenant_id
        ${whereClause}
        ORDER BY cb.created_at DESC
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
