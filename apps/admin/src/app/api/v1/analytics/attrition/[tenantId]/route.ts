import { type NextRequest, NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ULID: 26 chars, alphanumeric uppercase. Reject anything else.
const ULID_RE = /^[0-9A-Z]{26}$/;

// ── GET /api/v1/analytics/attrition/[tenantId] — Tenant detail + history ──

export const GET = withAdminPermission(
  async (_req: NextRequest, _session, params) => {
    const tenantId = params?.tenantId;
    if (!tenantId || !ULID_RE.test(tenantId)) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'Valid tenantId required' } },
        { status: 400 },
      );
    }

    // Latest score
    const latestRows = await db.execute(sql`
      SELECT
        id, tenant_id, overall_score, risk_level,
        login_decline_score, usage_decline_score, module_abandonment_score,
        user_shrinkage_score, error_frustration_score, breadth_narrowing_score,
        staleness_score, onboarding_stall_score,
        signal_details, narrative,
        tenant_name, tenant_status, industry, health_grade,
        total_locations, total_users, active_modules,
        last_activity_at::text, scored_at::text,
        reviewed_at::text, reviewed_by, review_notes, status
      FROM attrition_risk_scores
      WHERE tenant_id = ${tenantId}
        AND status != 'superseded'
      ORDER BY scored_at DESC
      LIMIT 1
    `);

    const latestArr = Array.from(latestRows as Iterable<Record<string, unknown>>);
    if (latestArr.length === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No attrition score for this tenant' } },
        { status: 404 },
      );
    }

    const r = latestArr[0]!;

    // Score history (last 10)
    const historyRows = await db.execute(sql`
      SELECT overall_score, risk_level, scored_at::text, status
      FROM attrition_risk_scores
      WHERE tenant_id = ${tenantId}
      ORDER BY scored_at DESC
      LIMIT 10 -- includes superseded for trend visibility
    `);
    const history = Array.from(historyRows as Iterable<Record<string, unknown>>).map((h) => ({
      overallScore: Number(h.overall_score),
      riskLevel: h.risk_level,
      scoredAt: h.scored_at,
    }));

    return NextResponse.json({
      data: {
        current: {
          id: r.id,
          tenantId: r.tenant_id,
          overallScore: Number(r.overall_score),
          riskLevel: r.risk_level,
          signals: {
            loginDecline: { score: Number(r.login_decline_score) },
            usageDecline: { score: Number(r.usage_decline_score) },
            moduleAbandonment: { score: Number(r.module_abandonment_score) },
            userShrinkage: { score: Number(r.user_shrinkage_score) },
            errorFrustration: { score: Number(r.error_frustration_score) },
            breadthNarrowing: { score: Number(r.breadth_narrowing_score) },
            staleness: { score: Number(r.staleness_score) },
            onboardingStall: { score: Number(r.onboarding_stall_score) },
          },
          signalDetails: r.signal_details,
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
        },
        history,
      },
    });
  },
  { permission: 'analytics.view' },
);
