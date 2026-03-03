import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/finance/gl-issues — GL posting issues ──

export const GET = withAdminPermission(
  async (req) => {
    const sp = new URL(req.url).searchParams;

    const tenantId = sp.get('tenant_id') ?? undefined;
    const dateFrom = sp.get('date_from') ?? undefined;
    const dateTo = sp.get('date_to') ?? undefined;

    const result = await withAdminDb(async (tx) => {
      // ── 1. Unmapped events (unresolved) ──
      const unmappedConditions: ReturnType<typeof sql>[] = [
        sql`ue.resolved_at IS NULL`,
      ];
      if (tenantId) {
        unmappedConditions.push(sql`ue.tenant_id = ${tenantId}`);
      }
      if (dateFrom) {
        unmappedConditions.push(sql`ue.created_at >= ${dateFrom}::timestamptz`);
      }
      if (dateTo) {
        unmappedConditions.push(sql`ue.created_at <= ${dateTo}::timestamptz`);
      }

      const unmappedWhere = sql`WHERE ${sql.join(unmappedConditions, sql` AND `)}`;

      const unmappedRows = await tx.execute(sql`
        SELECT
          ue.id,
          ue.tenant_id,
          ue.event_type,
          ue.source_module,
          ue.source_reference_id,
          ue.entity_type,
          ue.entity_id,
          ue.reason,
          ue.created_at,
          t.name AS tenant_name
        FROM gl_unmapped_events ue
        LEFT JOIN tenants t ON t.id = ue.tenant_id
        ${unmappedWhere}
        ORDER BY ue.created_at DESC
        LIMIT 100
      `);
      const unmappedEvents = Array.from(unmappedRows as Iterable<Record<string, unknown>>);

      // ── 2. Unposted entries (status = 'draft') ──
      const unpostedConditions: ReturnType<typeof sql>[] = [
        sql`je.status = 'draft'`,
      ];
      if (tenantId) {
        unpostedConditions.push(sql`je.tenant_id = ${tenantId}`);
      }
      if (dateFrom) {
        unpostedConditions.push(sql`je.created_at >= ${dateFrom}::timestamptz`);
      }
      if (dateTo) {
        unpostedConditions.push(sql`je.created_at <= ${dateTo}::timestamptz`);
      }

      const unpostedWhere = sql`WHERE ${sql.join(unpostedConditions, sql` AND `)}`;

      const unpostedRows = await tx.execute(sql`
        SELECT
          je.id,
          je.tenant_id,
          je.journal_number,
          je.source_module,
          je.source_reference_id,
          je.business_date,
          je.posting_period,
          je.memo,
          je.created_at,
          t.name AS tenant_name
        FROM gl_journal_entries je
        LEFT JOIN tenants t ON t.id = je.tenant_id
        ${unpostedWhere}
        ORDER BY je.created_at DESC
        LIMIT 100
      `);
      const unpostedEntries = Array.from(unpostedRows as Iterable<Record<string, unknown>>);

      // ── 3. Failed/voided postings (voided with a reason) ──
      const failedConditions: ReturnType<typeof sql>[] = [
        sql`je.status = 'voided'`,
        sql`je.void_reason IS NOT NULL`,
      ];
      if (tenantId) {
        failedConditions.push(sql`je.tenant_id = ${tenantId}`);
      }
      if (dateFrom) {
        failedConditions.push(sql`je.voided_at >= ${dateFrom}::timestamptz`);
      }
      if (dateTo) {
        failedConditions.push(sql`je.voided_at <= ${dateTo}::timestamptz`);
      }

      const failedWhere = sql`WHERE ${sql.join(failedConditions, sql` AND `)}`;

      const failedRows = await tx.execute(sql`
        SELECT
          je.id,
          je.tenant_id,
          je.journal_number,
          je.source_module,
          je.source_reference_id,
          je.business_date,
          je.posting_period,
          je.memo,
          je.void_reason,
          je.voided_at,
          je.created_at,
          t.name AS tenant_name
        FROM gl_journal_entries je
        LEFT JOIN tenants t ON t.id = je.tenant_id
        ${failedWhere}
        ORDER BY je.voided_at DESC
        LIMIT 100
      `);
      const failedPostings = Array.from(failedRows as Iterable<Record<string, unknown>>);

      // ── 4. Stats counts ──
      const unmappedCountResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS count FROM gl_unmapped_events ue ${unmappedWhere}
      `);
      const unpostedCountResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS count FROM gl_journal_entries je ${unpostedWhere}
      `);
      const failedCountResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS count FROM gl_journal_entries je ${failedWhere}
      `);

      const stats = {
        unmappedCount: Number(
          Array.from(unmappedCountResult as Iterable<{ count: number }>)[0]?.count ?? 0,
        ),
        unpostedCount: Number(
          Array.from(unpostedCountResult as Iterable<{ count: number }>)[0]?.count ?? 0,
        ),
        failedCount: Number(
          Array.from(failedCountResult as Iterable<{ count: number }>)[0]?.count ?? 0,
        ),
      };

      return {
        unmappedEvents,
        unpostedEntries,
        failedPostings,
        stats,
      };
    });

    return NextResponse.json({ data: result });
  },
  { permission: 'tenants.read' },
);
