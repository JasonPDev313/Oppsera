import { type NextRequest, NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Allowed filter values (whitelist) ────────────────────────────

const VALID_STATUSES = new Set(['open', 'reviewed', 'actioned', 'dismissed', 'superseded']);
const VALID_RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const MAX_REVIEW_NOTES = 2000;

// ── Cursor encoding ─────────────────────────────────────────────
// Compound cursor: "score|scored_at|id" to guarantee stable pagination
// with ORDER BY overall_score DESC, scored_at DESC, id DESC

function decodeCursor(raw: string): { score: number; ts: string; id: string } | null {
  const parts = raw.split('|');
  if (parts.length !== 3) return null;
  const score = Number(parts[0]);
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  const ts = parts[1] ?? '';
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(ts)) return null;
  const id = parts[2] ?? '';
  if (!id || id.length < 10) return null;
  return { score, ts, id };
}

function encodeCursor(row: Record<string, unknown>): string {
  return `${row.overall_score}|${row.scored_at}|${row.id}`;
}

// ── GET /api/v1/analytics/attrition — List attrition risk scores ──
// Query params: ?riskLevel=high&status=open&cursor=xxx&limit=50

export const GET = withAdminPermission(
  async (req: NextRequest) => {
    const { searchParams } = req.nextUrl;
    const rawStatus = searchParams.get('status') || 'open';
    const rawRiskLevel = searchParams.get('riskLevel');
    const rawCursor = searchParams.get('cursor');
    const rawLimit = searchParams.get('limit');

    // Validate & sanitize inputs — null = "all non-superseded"
    const status = rawStatus !== 'all' && VALID_STATUSES.has(rawStatus) ? rawStatus : null;
    const riskLevel = rawRiskLevel && rawRiskLevel !== 'all' && VALID_RISK_LEVELS.has(rawRiskLevel) ? rawRiskLevel : null;
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    const limit = Math.max(1, Math.min(Number(rawLimit) || 50, 100));

    // Compound cursor pagination:
    // WHERE (overall_score, scored_at, id) < (cursor.score, cursor.ts, cursor.id)
    // This matches ORDER BY overall_score DESC, scored_at DESC, id DESC
    const rows = await db.execute(sql`
      SELECT
        a.id, a.tenant_id, a.overall_score, a.risk_level,
        a.login_decline_score, a.usage_decline_score, a.module_abandonment_score,
        a.user_shrinkage_score, a.error_frustration_score, a.breadth_narrowing_score,
        a.staleness_score, a.onboarding_stall_score,
        a.narrative, a.tenant_name, a.tenant_status, a.industry, a.health_grade,
        a.total_locations, a.total_users, a.active_modules,
        a.last_activity_at::text, a.scored_at::text,
        a.reviewed_at::text, a.reviewed_by, a.review_notes, a.status,
        a.created_at::text,
        prev.overall_score AS previous_score
      FROM attrition_risk_scores a
      LEFT JOIN LATERAL (
        SELECT overall_score
        FROM attrition_risk_scores p
        WHERE p.tenant_id = a.tenant_id
          AND p.scored_at < a.scored_at
        ORDER BY p.scored_at DESC
        LIMIT 1
      ) prev ON true
      WHERE a.status != 'superseded'
        AND (${status}::text IS NULL OR a.status = ${status})
        AND (${riskLevel}::text IS NULL OR a.risk_level = ${riskLevel})
        AND (${cursor?.score ?? null}::int IS NULL OR
             (a.overall_score, a.scored_at, a.id) < (${cursor?.score ?? 0}, ${cursor?.ts ?? '2000-01-01'}::timestamptz, ${cursor?.id ?? ''}))
      ORDER BY a.overall_score DESC, a.scored_at DESC, a.id DESC
      LIMIT ${limit + 1}
    `);

    const all = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = all.length > limit;
    const items = all.slice(0, limit);

    // Stats — active scores only (not superseded)
    const statsRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open')::int AS open,
        COUNT(*) FILTER (WHERE status = 'reviewed')::int AS reviewed,
        COUNT(*) FILTER (WHERE status = 'actioned')::int AS actioned,
        COUNT(*) FILTER (WHERE status = 'dismissed')::int AS dismissed,
        COUNT(*) FILTER (WHERE risk_level = 'critical' AND status IN ('open', 'reviewed'))::int AS critical,
        COUNT(*) FILTER (WHERE risk_level = 'high' AND status IN ('open', 'reviewed'))::int AS high,
        COUNT(*) FILTER (WHERE risk_level = 'medium' AND status IN ('open', 'reviewed'))::int AS medium,
        COUNT(*) FILTER (WHERE risk_level = 'low' AND status IN ('open', 'reviewed'))::int AS low
      FROM attrition_risk_scores
      WHERE status != 'superseded'
    `);
    const statsArr = Array.from(statsRows as Iterable<Record<string, unknown>>);
    const stats = statsArr[0] || {};

    return NextResponse.json({
      data: {
        items: items.map((r) => ({
          id: r.id,
          tenantId: r.tenant_id,
          overallScore: Number(r.overall_score),
          riskLevel: r.risk_level,
          loginDeclineScore: Number(r.login_decline_score),
          usageDeclineScore: Number(r.usage_decline_score),
          moduleAbandonmentScore: Number(r.module_abandonment_score),
          userShrinkageScore: Number(r.user_shrinkage_score),
          errorFrustrationScore: Number(r.error_frustration_score),
          breadthNarrowingScore: Number(r.breadth_narrowing_score),
          stalenessScore: Number(r.staleness_score),
          onboardingStallScore: Number(r.onboarding_stall_score),
          narrative: r.narrative,
          tenantName: r.tenant_name,
          tenantStatus: r.tenant_status,
          industry: r.industry,
          healthGrade: r.health_grade,
          totalLocations: Number(r.total_locations),
          totalUsers: Number(r.total_users),
          activeModules: Number(r.active_modules),
          lastActivityAt: r.last_activity_at,
          scoredAt: r.scored_at,
          reviewedAt: r.reviewed_at,
          reviewedBy: r.reviewed_by,
          reviewNotes: r.review_notes,
          status: r.status,
          previousScore: r.previous_score != null ? Number(r.previous_score) : null,
        })),
        stats: {
          open: Number(stats.open ?? 0),
          reviewed: Number(stats.reviewed ?? 0),
          actioned: Number(stats.actioned ?? 0),
          dismissed: Number(stats.dismissed ?? 0),
          critical: Number(stats.critical ?? 0),
          high: Number(stats.high ?? 0),
          medium: Number(stats.medium ?? 0),
          low: Number(stats.low ?? 0),
        },
        cursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]!) : null,
        hasMore,
      },
    });
  },
  { permission: 'analytics.view' },
);

// ── PATCH /api/v1/analytics/attrition — Update status ──
// Requires analytics.manage (write permission, not just view)

const VALID_PATCH_STATUSES = new Set(['reviewed', 'actioned', 'dismissed']);

export const PATCH = withAdminPermission(
  async (req: NextRequest, session) => {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } },
        { status: 400 },
      );
    }
    const { id, status, reviewNotes } = body as {
      id: string;
      status: string;
      reviewNotes?: string;
    };

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'id is required and must be a string' } },
        { status: 400 },
      );
    }

    if (!VALID_PATCH_STATUSES.has(status)) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: `status must be one of: ${[...VALID_PATCH_STATUSES].join(', ')}` } },
        { status: 400 },
      );
    }

    const safeNotes = reviewNotes
      ? String(reviewNotes).slice(0, MAX_REVIEW_NOTES)
      : null;

    const result = await db.execute(sql`
      UPDATE attrition_risk_scores
      SET status = ${status},
          reviewed_by = ${session.adminId},
          reviewed_at = NOW(),
          review_notes = COALESCE(${safeNotes}, review_notes),
          updated_at = NOW()
      WHERE id = ${id}
        AND status IN ('open', 'reviewed')
      RETURNING id
    `);

    const updated = Array.from(result as Iterable<unknown>);
    if (updated.length === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Score not found or already actioned/dismissed' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: { success: true } });
  },
  { permission: 'analytics.manage' },
);
