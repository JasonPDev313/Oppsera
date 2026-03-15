import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

const PERIOD_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const period = sp.get('period') ?? '30d';
  const tenantId = sp.get('tenantId') ?? null;
  const moduleKey = sp.get('moduleKey') ?? null;
  const days = PERIOD_DAYS[period] ?? 30;

  const [
    kpiRows,
    tierRows,
    dailyRows,
    topScreenRows,
    topQuestionRows,
    failureRows,
    reviewRows,
    autoDraftRows,
    csatRows,
    sentimentRows,
    tagRows,
    escalationRows,
  ] = await Promise.all([
    // ── KPI aggregate ────────────────────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          COUNT(DISTINCT m.id) FILTER (WHERE m.role = 'user')::int                    AS total_questions,
          COUNT(DISTINCT m.id) FILTER (WHERE m.role = 'assistant')::int                AS answered_count,
          COUNT(DISTINCT th.id) FILTER (WHERE th.outcome = 'escalated')::int           AS escalated_count,
          COUNT(DISTINCT f.id) FILTER (WHERE f.rating = 'up')::int                     AS positive_count,
          COUNT(DISTINCT f.id) FILTER (WHERE f.rating = 'down')::int                  AS negative_count,
          COUNT(DISTINCT f.id)::int                                                     AS total_feedback,
          COUNT(DISTINCT m.id) FILTER (
            WHERE m.role = 'assistant' AND m.answer_confidence = 'low'
          )::int                                                                        AS low_confidence_count,
          COUNT(DISTINCT m.id) FILTER (
            WHERE m.role = 'assistant' AND m.source_tier_used IN ('t2', 't3')
          )::int                                                                        AS approved_hit_count
        FROM ai_assistant_threads th
        LEFT JOIN ai_assistant_messages m ON m.thread_id = th.id
        LEFT JOIN ai_assistant_feedback f ON f.message_id = m.id
        WHERE th.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND (${tenantId}::text IS NULL OR th.tenant_id = ${tenantId}::text)
          AND (${moduleKey}::text IS NULL OR th.module_key = ${moduleKey}::text)
      `);
    }),

    // ── Source tier distribution ──────────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          COALESCE(m.source_tier_used, 'unknown') AS tier,
          COUNT(*)::int AS cnt
        FROM ai_assistant_messages m
        JOIN ai_assistant_threads th ON th.id = m.thread_id
        WHERE m.role = 'assistant'
          AND m.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND (${tenantId}::text IS NULL OR m.tenant_id = ${tenantId}::text)
          AND (${moduleKey}::text IS NULL OR th.module_key = ${moduleKey}::text)
        GROUP BY m.source_tier_used
        ORDER BY cnt DESC
      `);
    }),

    // ── Daily trends ──────────────────────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          date_trunc('day', m.created_at)::date::text AS day,
          COUNT(*) FILTER (WHERE m.role = 'user')::int          AS questions,
          COUNT(*) FILTER (WHERE m.role = 'assistant')::int     AS answered,
          COUNT(*) FILTER (
            WHERE m.role = 'assistant' AND m.answer_confidence = 'low'
          )::int                                                 AS low_confidence,
          COUNT(DISTINCT f.id) FILTER (WHERE f.rating = 'down')::int        AS thumbs_down
        FROM ai_assistant_messages m
        JOIN ai_assistant_threads th ON th.id = m.thread_id
        LEFT JOIN ai_assistant_feedback f ON f.message_id = m.id
        WHERE m.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND (${tenantId}::text IS NULL OR m.tenant_id = ${tenantId}::text)
          AND (${moduleKey}::text IS NULL OR th.module_key = ${moduleKey}::text)
        GROUP BY date_trunc('day', m.created_at)
        ORDER BY day ASC
      `);
    }),

    // ── Top screens ───────────────────────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          COALESCE(th.current_route, 'unknown') AS route,
          COALESCE(th.module_key, 'unknown')    AS module_key,
          COUNT(DISTINCT th.id)::int            AS cnt
        FROM ai_assistant_threads th
        WHERE th.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND (${tenantId}::text IS NULL OR th.tenant_id = ${tenantId}::text)
          AND (${moduleKey}::text IS NULL OR th.module_key = ${moduleKey}::text)
        GROUP BY th.current_route, th.module_key
        ORDER BY cnt DESC
        LIMIT 10
      `);
    }),

    // ── Top repeated questions ────────────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          LEFT(m.message_text, 120)                     AS question,
          COUNT(*)::int                                 AS cnt,
          MAX(COALESCE(th.current_route, 'unknown'))    AS route
        FROM ai_assistant_messages m
        JOIN ai_assistant_threads th ON th.id = m.thread_id
        WHERE m.role = 'user'
          AND m.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND LENGTH(m.message_text) > 10
          AND (${tenantId}::text IS NULL OR m.tenant_id = ${tenantId}::text)
          AND (${moduleKey}::text IS NULL OR th.module_key = ${moduleKey}::text)
        GROUP BY LEFT(m.message_text, 120)
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
        LIMIT 15
      `);
    }),

    // ── Failure clusters ──────────────────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          COALESCE(th.question_type, 'unknown')         AS question_type,
          COALESCE(th.issue_tag, 'unknown')             AS issue_tag,
          COUNT(DISTINCT th.id)::int                    AS cnt,
          MAX(COALESCE(th.current_route, 'unknown'))    AS screen_route
        FROM ai_assistant_threads th
        WHERE th.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND (th.question_type IS NOT NULL OR th.issue_tag IS NOT NULL)
          AND (${tenantId}::text IS NULL OR th.tenant_id = ${tenantId}::text)
          AND (${moduleKey}::text IS NULL OR th.module_key = ${moduleKey}::text)
        GROUP BY th.question_type, th.issue_tag
        ORDER BY cnt DESC
        LIMIT 15
      `);
    }),

    // ── Review metrics ────────────────────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE r.review_status IS NOT NULL)::int  AS reviewed_count,
          COUNT(m.id) FILTER (
            WHERE m.role = 'assistant'
              AND m.answer_confidence = 'low'
              AND NOT EXISTS (
                SELECT 1 FROM ai_assistant_reviews r2
                WHERE r2.message_id = m.id
              )
          )::int                                                     AS pending_review_count,
          PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (r.created_at - m.created_at)) / 3600.0
          )                                                          AS median_hours_to_review
        FROM ai_assistant_messages m
        JOIN ai_assistant_threads th ON th.id = m.thread_id
        LEFT JOIN ai_assistant_reviews r ON r.message_id = m.id
        WHERE m.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND (${tenantId}::text IS NULL OR m.tenant_id = ${tenantId}::text)
          AND (${moduleKey}::text IS NULL OR th.module_key = ${moduleKey}::text)
      `);
    }),

    // ── Auto-draft metrics ───────────────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          COUNT(*) FILTER (
            WHERE ac.owner_user_id = '__auto_draft__'
          )::int                                                      AS auto_draft_total,
          COUNT(*) FILTER (
            WHERE ac.owner_user_id = '__auto_draft__'
              AND ac.created_at >= NOW() - INTERVAL '1 day' * ${days}
          )::int                                                      AS auto_draft_period,
          COUNT(*) FILTER (
            WHERE ac.owner_user_id = '__auto_draft__'
              AND ac.status = 'draft'
          )::int                                                      AS auto_draft_pending,
          COUNT(*) FILTER (
            WHERE ac.owner_user_id = '__auto_draft__'
              AND ac.status = 'active'
          )::int                                                      AS auto_draft_activated,
          COUNT(*) FILTER (
            WHERE ac.owner_user_id = '__auto_draft__'
              AND ac.status = 'archived'
          )::int                                                      AS auto_draft_archived
        FROM ai_support_answer_cards ac
      `);
    }),

    // ── CSAT prediction metrics ───────────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          COUNT(*)::int AS total_predictions,
          AVG(score)    AS avg_score,
          COUNT(*) FILTER (WHERE score >= 4)::int AS satisfied_count,
          COUNT(*) FILTER (WHERE score <= 2)::int AS dissatisfied_count,
          COUNT(*) FILTER (WHERE score = 1)::int  AS score_1,
          COUNT(*) FILTER (WHERE score = 2)::int  AS score_2,
          COUNT(*) FILTER (WHERE score = 3)::int  AS score_3,
          COUNT(*) FILTER (WHERE score = 4)::int  AS score_4,
          COUNT(*) FILTER (WHERE score = 5)::int  AS score_5
        FROM ai_support_csat_predictions cp
        JOIN ai_assistant_threads th ON th.id = cp.thread_id
        WHERE cp.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND (${tenantId}::text IS NULL OR cp.tenant_id = ${tenantId}::text)
          AND (${moduleKey}::text IS NULL OR th.module_key = ${moduleKey}::text)
      `);
    }),

    // ── Sentiment distribution ────────────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          COALESCE(m.sentiment, 'unknown') AS sentiment,
          COUNT(*)::int AS cnt
        FROM ai_assistant_messages m
        WHERE m.role = 'user'
          AND m.sentiment IS NOT NULL
          AND m.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND (${tenantId}::text IS NULL OR m.tenant_id = ${tenantId}::text)
        GROUP BY m.sentiment
        ORDER BY cnt DESC
      `);
    }),

    // ── Conversation tag distribution ─────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          ct.tag_type,
          ct.tag_value,
          COUNT(*)::int AS cnt
        FROM ai_support_conversation_tags ct
        JOIN ai_assistant_threads th ON th.id = ct.thread_id
        WHERE ct.created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND (${tenantId}::text IS NULL OR ct.tenant_id = ${tenantId}::text)
          AND (${moduleKey}::text IS NULL OR th.module_key = ${moduleKey}::text)
        GROUP BY ct.tag_type, ct.tag_value
        ORDER BY cnt DESC
        LIMIT 30
      `);
    }),

    // ── Escalation metrics ────────────────────────────────────────
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          COUNT(*)::int AS total_escalations,
          COUNT(*) FILTER (WHERE status = 'open')::int     AS open_count,
          COUNT(*) FILTER (WHERE status = 'assigned')::int AS assigned_count,
          COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_count,
          COUNT(*) FILTER (WHERE status = 'closed')::int   AS closed_count
        FROM ai_support_escalations
        WHERE created_at >= NOW() - INTERVAL '1 day' * ${days}
          AND (${tenantId}::text IS NULL OR tenant_id = ${tenantId}::text)
      `);
    }),
  ]);

  // ── Parse KPIs ───────────────────────────────────────────────────
  const kpiList = Array.from(kpiRows as Iterable<Record<string, unknown>>);
  const k = kpiList[0] ?? {};

  const totalQuestions = Number(k.total_questions ?? 0);
  const answeredCount = Number(k.answered_count ?? 0);
  const escalatedCount = Number(k.escalated_count ?? 0);
  const positiveCount = Number(k.positive_count ?? 0);
  const negativeCount = Number(k.negative_count ?? 0);
  const totalFeedback = Number(k.total_feedback ?? 0);
  const lowConfidenceCount = Number(k.low_confidence_count ?? 0);
  const approvedHitCount = Number(k.approved_hit_count ?? 0);

  const answerRate = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 1000) / 10 : 0;
  const positiveFeedbackRate = totalFeedback > 0 ? Math.round((positiveCount / totalFeedback) * 1000) / 10 : 0;
  const negativeFeedbackRate = totalFeedback > 0 ? Math.round((negativeCount / totalFeedback) * 1000) / 10 : 0;
  const lowConfidenceRate = answeredCount > 0 ? Math.round((lowConfidenceCount / answeredCount) * 1000) / 10 : 0;
  const escalationRate = totalQuestions > 0 ? Math.round((escalatedCount / totalQuestions) * 1000) / 10 : 0;
  const approvedAnswerHitRate = answeredCount > 0 ? Math.round((approvedHitCount / answeredCount) * 1000) / 10 : 0;
  const deflectionEstimate = totalQuestions > 0 ? Math.round(((totalQuestions - escalatedCount) / totalQuestions) * 1000) / 10 : 0;

  // ── Source tier distribution ──────────────────────────────────
  const tierArr = Array.from(tierRows as Iterable<Record<string, unknown>>);
  const totalTier = tierArr.reduce((s, r) => s + Number(r.cnt), 0);
  const sourceTierDistribution = tierArr.map((r) => ({
    tier: r.tier as string,
    count: Number(r.cnt),
    percentage: totalTier > 0 ? Math.round((Number(r.cnt) / totalTier) * 1000) / 10 : 0,
  }));

  // ── Daily trends ──────────────────────────────────────────────
  const dailyTrends = Array.from(dailyRows as Iterable<Record<string, unknown>>).map((r) => ({
    date: r.day as string,
    questions: Number(r.questions ?? 0),
    answered: Number(r.answered ?? 0),
    lowConfidence: Number(r.low_confidence ?? 0),
    thumbsDown: Number(r.thumbs_down ?? 0),
  }));

  // ── Top screens ───────────────────────────────────────────────
  const topScreens = Array.from(topScreenRows as Iterable<Record<string, unknown>>).map((r) => ({
    route: r.route as string,
    moduleKey: r.module_key as string,
    count: Number(r.cnt),
  }));

  // ── Top questions ─────────────────────────────────────────────
  const topQuestions = Array.from(topQuestionRows as Iterable<Record<string, unknown>>).map((r) => ({
    question: r.question as string,
    count: Number(r.cnt),
    route: r.route as string,
  }));

  // ── Failure clusters ──────────────────────────────────────────
  const failureClusters = Array.from(failureRows as Iterable<Record<string, unknown>>).map((r) => ({
    questionType: r.question_type as string,
    issueTag: r.issue_tag as string,
    count: Number(r.cnt),
    screenRoute: r.screen_route as string,
  }));

  // ── Review metrics ────────────────────────────────────────────
  const reviewList = Array.from(reviewRows as Iterable<Record<string, unknown>>);
  const rv = reviewList[0] ?? {};
  const reviewedCount = Number(rv.reviewed_count ?? 0);
  const pendingReviewCount = Number(rv.pending_review_count ?? 0);
  const medianTimeToReview = rv.median_hours_to_review != null
    ? Math.round(Number(rv.median_hours_to_review) * 10) / 10
    : 0;

  // ── Auto-draft metrics ────────────────────────────────────────
  const adList = Array.from(autoDraftRows as Iterable<Record<string, unknown>>);
  const ad = adList[0] ?? {};
  const autoDraftTotal = Number(ad.auto_draft_total ?? 0);
  const autoDraftPeriod = Number(ad.auto_draft_period ?? 0);
  const autoDraftPending = Number(ad.auto_draft_pending ?? 0);
  const autoDraftActivated = Number(ad.auto_draft_activated ?? 0);
  const autoDraftArchived = Number(ad.auto_draft_archived ?? 0);
  const autoDraftAcceptanceRate = autoDraftTotal > 0
    ? Math.round((autoDraftActivated / autoDraftTotal) * 1000) / 10
    : 0;

  // ── CSAT metrics ─────────────────────────────────────────────
  const csatList = Array.from(csatRows as Iterable<Record<string, unknown>>);
  const cs = csatList[0] ?? {};
  const csatPredictions = {
    totalPredictions: Number(cs.total_predictions ?? 0),
    avgScore: cs.avg_score != null ? Math.round(Number(cs.avg_score) * 10) / 10 : 0,
    satisfiedCount: Number(cs.satisfied_count ?? 0),
    dissatisfiedCount: Number(cs.dissatisfied_count ?? 0),
    distribution: [
      Number(cs.score_1 ?? 0),
      Number(cs.score_2 ?? 0),
      Number(cs.score_3 ?? 0),
      Number(cs.score_4 ?? 0),
      Number(cs.score_5 ?? 0),
    ],
  };

  // ── Sentiment distribution ─────────────────────────────────
  const sentimentDistribution = Array.from(sentimentRows as Iterable<Record<string, unknown>>).map((r) => ({
    sentiment: r.sentiment as string,
    count: Number(r.cnt),
  }));

  // ── Conversation tag distribution ──────────────────────────
  const conversationTags = Array.from(tagRows as Iterable<Record<string, unknown>>).map((r) => ({
    tagType: r.tag_type as string,
    tagValue: r.tag_value as string,
    count: Number(r.cnt),
  }));

  // ── Escalation metrics ─────────────────────────────────────
  const escList = Array.from(escalationRows as Iterable<Record<string, unknown>>);
  const esc = escList[0] ?? {};
  const escalationMetrics = {
    totalEscalations: Number(esc.total_escalations ?? 0),
    openCount: Number(esc.open_count ?? 0),
    assignedCount: Number(esc.assigned_count ?? 0),
    resolvedCount: Number(esc.resolved_count ?? 0),
    closedCount: Number(esc.closed_count ?? 0),
  };

  return NextResponse.json({
    data: {
      totalQuestions,
      answeredCount,
      escalatedCount,
      answerRate,
      positiveFeedbackRate,
      negativeFeedbackRate,
      lowConfidenceRate,
      escalationRate,
      sourceTierDistribution,
      approvedAnswerHitRate,
      dailyTrends,
      topScreens,
      topQuestions,
      failureClusters,
      medianTimeToReview,
      reviewedCount,
      pendingReviewCount,
      deflectionEstimate,
      autoDraft: {
        totalCreated: autoDraftTotal,
        createdThisPeriod: autoDraftPeriod,
        pendingReview: autoDraftPending,
        activated: autoDraftActivated,
        archived: autoDraftArchived,
        acceptanceRate: autoDraftAcceptanceRate,
      },
      csatPredictions,
      sentimentDistribution,
      conversationTags,
      escalationMetrics,
    },
  });
}, { permission: 'ai_support.admin' });
