import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { sql } from '@oppsera/db';
import { withAdminDb } from '@/lib/admin-db';

// ── GET /api/v1/health/tenants — Tenant health list with filters ───

export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const healthGrade = sp.get('health_grade') ?? '';
  const hasDlqIssues = sp.get('has_dlq_issues') === 'true';
  const hasGlIssues = sp.get('has_gl_issues') === 'true';
  const inactive = sp.get('inactive') === 'true';
  const sort = sp.get('sort') ?? 'score';
  const limit = Math.min(Number(sp.get('limit') ?? 50), 200);
  const cursor = sp.get('cursor') ?? '';

  const data = await withAdminDb(async (tx) => {
    const ts = (v: unknown) =>
      v instanceof Date ? v.toISOString() : v ? String(v) : null;

    // Build WHERE conditions
    const conditions = [sql`1=1`];

    if (healthGrade) {
      conditions.push(sql`ths.health_grade = ${healthGrade}`);
    }
    if (hasDlqIssues) {
      conditions.push(sql`ths.dlq_depth > 0`);
    }
    if (hasGlIssues) {
      conditions.push(sql`(ths.unmapped_gl_events > 0 OR ths.unposted_gl_entries > 5)`);
    }
    if (inactive) {
      conditions.push(sql`ths.orders_24h = 0`);
    }
    if (cursor) {
      conditions.push(sql`ths.tenant_id > ${cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    // Sort mapping
    const sortMap: Record<string, ReturnType<typeof sql>> = {
      score: sql`ths.health_score ASC, ths.tenant_id ASC`,
      grade: sql`ths.health_grade DESC, ths.tenant_id ASC`,
      name: sql`t.name ASC, ths.tenant_id ASC`,
      dlq: sql`ths.dlq_depth DESC, ths.tenant_id ASC`,
      errors: sql`ths.error_count_1h DESC, ths.tenant_id ASC`,
    };
    const orderBy = sortMap[sort] ?? sortMap.score!;

    // DISTINCT ON to get latest snapshot per tenant, then filter + sort
    const rows = await tx.execute(sql`
      WITH latest_snapshots AS (
        SELECT DISTINCT ON (tenant_id) *
        FROM tenant_health_snapshots
        ORDER BY tenant_id, captured_at DESC
      )
      SELECT
        ths.id,
        ths.tenant_id,
        t.name AS tenant_name,
        t.status AS tenant_status,
        t.industry,
        ths.captured_at,
        ths.orders_24h,
        ths.active_users_24h,
        ths.last_order_at,
        ths.last_login_at,
        ths.error_count_24h,
        ths.error_count_1h,
        ths.dlq_depth,
        ths.dlq_unresolved_over_24h,
        ths.unposted_gl_entries,
        ths.unmapped_gl_events,
        ths.open_close_batches,
        ths.health_score,
        ths.health_grade,
        ths.grade_factors
      FROM latest_snapshots ths
      JOIN tenants t ON t.id = ths.tenant_id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ${limit + 1}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;

    const mapped = pageItems.map((r) => ({
      id: r.id as string,
      tenantId: r.tenant_id as string,
      tenantName: r.tenant_name as string,
      tenantStatus: r.tenant_status as string,
      industry: r.industry as string | null,
      capturedAt: ts(r.captured_at),
      orders24h: Number(r.orders_24h ?? 0),
      activeUsers24h: Number(r.active_users_24h ?? 0),
      lastOrderAt: ts(r.last_order_at),
      lastLoginAt: ts(r.last_login_at),
      errorCount24h: Number(r.error_count_24h ?? 0),
      errorCount1h: Number(r.error_count_1h ?? 0),
      dlqDepth: Number(r.dlq_depth ?? 0),
      dlqUnresolvedOver24h: Number(r.dlq_unresolved_over_24h ?? 0),
      unpostedGlEntries: Number(r.unposted_gl_entries ?? 0),
      unmappedGlEvents: Number(r.unmapped_gl_events ?? 0),
      openCloseBatches: Number(r.open_close_batches ?? 0),
      healthScore: Number(r.health_score ?? 100),
      healthGrade: r.health_grade as string,
      gradeFactors: r.grade_factors as unknown[],
    }));

    const nextCursor = hasMore && pageItems.length > 0
      ? (pageItems[pageItems.length - 1]!.tenant_id as string)
      : null;

    return { items: mapped, cursor: nextCursor, hasMore };
  });

  return NextResponse.json({
    data: data.items,
    meta: { cursor: data.cursor, hasMore: data.hasMore },
  });
}, { permission: 'tenants.read' });
