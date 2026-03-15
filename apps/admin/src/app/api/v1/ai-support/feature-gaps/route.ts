import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

// ── GET /api/v1/ai-support/feature-gaps ──────────────────────────────
// List feature gaps with filtering, sorting, and analytics summary

export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status') ?? null;
  const moduleKey = sp.get('moduleKey') ?? null;
  const priority = sp.get('priority') ?? null;
  const sortBy = sp.get('sortBy') ?? 'frequency'; // frequency | recent | priority
  const limit = Math.min(Number(sp.get('limit') ?? 100), 500);

  // ── Build WHERE clause ──
  const conditions = [sql`1=1`];
  if (status) conditions.push(sql`status = ${status}`);
  if (moduleKey) conditions.push(sql`module_key = ${moduleKey}`);
  if (priority) conditions.push(sql`priority = ${priority}`);
  const whereClause = sql.join(conditions, sql` AND `);

  // ── Build ORDER BY ──
  const orderClause =
    sortBy === 'recent'
      ? sql`last_seen_at DESC`
      : sortBy === 'priority'
        ? sql`CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END ASC, occurrence_count DESC`
        : sql`occurrence_count DESC, last_seen_at DESC`;

  const [rows, summaryRows] = await Promise.all([
    // ── Main list ──
    withAdminDb(async (tx) =>
      tx.execute(sql`
        SELECT id, tenant_id, question_normalized, module_key, route,
               occurrence_count, first_seen_at, last_seen_at,
               sample_question, sample_thread_id, sample_confidence,
               status, priority, admin_notes, feature_request_id,
               reviewed_by, reviewed_at, created_at, updated_at
        FROM ai_support_feature_gaps
        WHERE ${whereClause}
        ORDER BY ${orderClause}
        LIMIT ${limit}
      `),
    ),

    // ── Summary stats ──
    withAdminDb(async (tx) =>
      tx.execute(sql`
        SELECT
          COUNT(*)::int                                                    AS total,
          COUNT(*) FILTER (WHERE status = 'open')::int                    AS open_count,
          COUNT(*) FILTER (WHERE status = 'under_review')::int            AS under_review_count,
          COUNT(*) FILTER (WHERE status = 'planned')::int                 AS planned_count,
          COUNT(*) FILTER (WHERE status = 'shipped')::int                 AS shipped_count,
          COUNT(*) FILTER (WHERE status = 'dismissed')::int               AS dismissed_count,
          COUNT(*) FILTER (WHERE priority = 'critical')::int              AS critical_count,
          COUNT(*) FILTER (WHERE priority = 'high')::int                  AS high_count,
          SUM(occurrence_count)::int                                       AS total_occurrences,
          COUNT(DISTINCT module_key)::int                                  AS unique_modules,
          MAX(last_seen_at)                                                AS latest_gap_at
        FROM ai_support_feature_gaps
      `),
    ),
  ]);

  const ts = (v: unknown) => v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string | null) ?? null,
    questionNormalized: r['question_normalized'] as string,
    moduleKey: (r['module_key'] as string | null) ?? null,
    route: (r['route'] as string | null) ?? null,
    occurrenceCount: Number(r['occurrence_count']),
    firstSeenAt: ts(r['first_seen_at']),
    lastSeenAt: ts(r['last_seen_at']),
    sampleQuestion: r['sample_question'] as string,
    sampleThreadId: (r['sample_thread_id'] as string | null) ?? null,
    sampleConfidence: (r['sample_confidence'] as string | null) ?? null,
    status: r['status'] as string,
    priority: r['priority'] as string,
    adminNotes: (r['admin_notes'] as string | null) ?? null,
    featureRequestId: (r['feature_request_id'] as string | null) ?? null,
    reviewedBy: (r['reviewed_by'] as string | null) ?? null,
    reviewedAt: ts(r['reviewed_at']),
    createdAt: ts(r['created_at']),
    updatedAt: ts(r['updated_at']),
  }));

  // Parse summary
  const summaryList = Array.from(summaryRows as Iterable<Record<string, unknown>>);
  const s = summaryList[0] ?? {};

  const summary = {
    total: Number(s.total ?? 0),
    openCount: Number(s.open_count ?? 0),
    underReviewCount: Number(s.under_review_count ?? 0),
    plannedCount: Number(s.planned_count ?? 0),
    shippedCount: Number(s.shipped_count ?? 0),
    dismissedCount: Number(s.dismissed_count ?? 0),
    criticalCount: Number(s.critical_count ?? 0),
    highCount: Number(s.high_count ?? 0),
    totalOccurrences: Number(s.total_occurrences ?? 0),
    uniqueModules: Number(s.unique_modules ?? 0),
    latestGapAt: ts(s.latest_gap_at),
  };

  return NextResponse.json({ data: { items, summary } });
}, { permission: 'ai_support.admin' });
