import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/finance/close-batches — Close batch status (F&B + Retail) ──

export const GET = withAdminPermission(
  async (req) => {
    const sp = new URL(req.url).searchParams;

    const tenantId = sp.get('tenant_id') ?? undefined;
    const locationId = sp.get('location_id') ?? undefined;
    const businessDate = sp.get('business_date') ?? undefined;
    const status = sp.get('status') ?? undefined;
    const page = Math.max(1, Number(sp.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? '25')));
    const offset = (page - 1) * limit;

    const result = await withAdminDb(async (tx) => {
      // Build WHERE conditions for both batch types
      const fnbConditions: ReturnType<typeof sql>[] = [];
      const retailConditions: ReturnType<typeof sql>[] = [];

      if (tenantId) {
        fnbConditions.push(sql`fb.tenant_id = ${tenantId}`);
        retailConditions.push(sql`rb.tenant_id = ${tenantId}`);
      }
      if (locationId) {
        fnbConditions.push(sql`fb.location_id = ${locationId}`);
        retailConditions.push(sql`rb.location_id = ${locationId}`);
      }
      if (businessDate) {
        fnbConditions.push(sql`fb.business_date = ${businessDate}::date`);
        retailConditions.push(sql`rb.business_date = ${businessDate}::date`);
      }
      if (status) {
        fnbConditions.push(sql`fb.status = ${status}`);
        retailConditions.push(sql`rb.status = ${status}`);
      }

      const fnbWhere =
        fnbConditions.length > 0
          ? sql`WHERE ${sql.join(fnbConditions, sql` AND `)}`
          : sql``;
      const retailWhere =
        retailConditions.length > 0
          ? sql`WHERE ${sql.join(retailConditions, sql` AND `)}`
          : sql``;

      // UNION of both batch types with count
      const countResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS total FROM (
          SELECT fb.id FROM fnb_close_batches fb ${fnbWhere}
          UNION ALL
          SELECT rb.id FROM retail_close_batches rb ${retailWhere}
        ) combined
      `);
      const total = Number(
        Array.from(countResult as Iterable<{ total: number }>)[0]?.total ?? 0,
      );

      // UNION query with batch_type discriminator
      const rows = await tx.execute(sql`
        SELECT * FROM (
          SELECT
            fb.id,
            fb.tenant_id,
            fb.location_id,
            NULL AS terminal_id,
            fb.business_date,
            fb.status,
            fb.started_at,
            fb.started_by,
            fb.reconciled_at,
            fb.reconciled_by,
            fb.posted_at,
            fb.posted_by,
            fb.locked_at,
            fb.gl_journal_entry_id,
            fb.notes,
            fb.created_at,
            'fnb' AS batch_type,
            CASE
              WHEN fb.status = 'open' AND fb.business_date < CURRENT_DATE THEN true
              ELSE false
            END AS is_overdue,
            t.name AS tenant_name,
            l.name AS location_name
          FROM fnb_close_batches fb
          LEFT JOIN tenants t ON t.id = fb.tenant_id
          LEFT JOIN locations l ON l.id = fb.location_id
          ${fnbWhere}

          UNION ALL

          SELECT
            rb.id,
            rb.tenant_id,
            rb.location_id,
            rb.terminal_id,
            rb.business_date,
            rb.status,
            rb.started_at,
            rb.started_by,
            rb.reconciled_at,
            rb.reconciled_by,
            rb.posted_at,
            rb.posted_by,
            rb.locked_at,
            rb.gl_journal_entry_id,
            rb.notes,
            rb.created_at,
            'retail' AS batch_type,
            CASE
              WHEN rb.status = 'open' AND rb.business_date < CURRENT_DATE THEN true
              ELSE false
            END AS is_overdue,
            t.name AS tenant_name,
            l.name AS location_name
          FROM retail_close_batches rb
          LEFT JOIN tenants t ON t.id = rb.tenant_id
          LEFT JOIN locations l ON l.id = rb.location_id
          ${retailWhere}
        ) batches
        ORDER BY
          business_date DESC,
          CASE status
            WHEN 'open' THEN 0
            WHEN 'in_progress' THEN 1
            WHEN 'reconciled' THEN 2
            WHEN 'posted' THEN 3
            WHEN 'locked' THEN 4
            ELSE 5
          END ASC
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
