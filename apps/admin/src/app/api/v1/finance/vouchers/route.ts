import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/finance/vouchers — Voucher lookup across tenants ──

export const GET = withAdminPermission(
  async (req) => {
    const sp = new URL(req.url).searchParams;

    const tenantId = sp.get('tenant_id') ?? undefined;
    const code = sp.get('code') ?? undefined;
    const status = sp.get('status') ?? undefined;
    const voucherType = sp.get('voucher_type') ?? undefined;
    const page = Math.max(1, Number(sp.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? '25')));
    const offset = (page - 1) * limit;

    const result = await withAdminDb(async (tx) => {
      const conditions: ReturnType<typeof sql>[] = [];

      if (tenantId) {
        conditions.push(sql`v.tenant_id = ${tenantId}`);
      }
      if (code) {
        conditions.push(sql`v.voucher_number ILIKE ${'%' + code + '%'}`);
      }
      if (status) {
        conditions.push(sql`v.redemption_status = ${status}`);
      }
      if (voucherType) {
        conditions.push(sql`vt.voucher_type = ${voucherType}`);
      }

      const whereClause =
        conditions.length > 0
          ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
          : sql``;

      // Count total
      const countResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM vouchers v
        LEFT JOIN voucher_types vt ON vt.id = v.voucher_type_id
        ${whereClause}
      `);
      const total = Number(
        Array.from(countResult as Iterable<{ total: number }>)[0]?.total ?? 0,
      );

      // Fetch vouchers
      const rows = await tx.execute(sql`
        SELECT
          v.id,
          v.tenant_id,
          v.voucher_type_id,
          v.voucher_number,
          v.voucher_amount_cents,
          v.redeemed_amount_cents,
          v.tax_cents,
          v.total_cents,
          v.redemption_status,
          v.validity_start_date,
          v.validity_end_date,
          v.customer_id,
          v.first_name,
          v.last_name,
          v.order_id,
          v.refund_order_id,
          v.notes,
          v.created_at,
          v.updated_at,
          vt.name AS voucher_type_name,
          vt.voucher_type AS voucher_type_category,
          t.name AS tenant_name,
          cust.display_name AS customer_name
        FROM vouchers v
        LEFT JOIN voucher_types vt ON vt.id = v.voucher_type_id
        LEFT JOIN tenants t ON t.id = v.tenant_id
        LEFT JOIN customers cust ON cust.id = v.customer_id AND cust.tenant_id = v.tenant_id
        ${whereClause}
        ORDER BY v.created_at DESC
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
