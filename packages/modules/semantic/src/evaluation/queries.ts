import { db } from '@oppsera/db';
import {
  semanticEvalTurns,
  semanticEvalSessions,
  semanticEvalExamples,
  semanticEvalQualityDaily,
} from '@oppsera/db';
import { sql, eq, and, gte, lte, desc, asc, isNotNull, like, inArray } from 'drizzle-orm';
import type { EvalTurn, EvalSession, EvalExample, QualityDaily, ExampleCategory, ExampleDifficulty, FeedbackTag, QualityFlag } from './types';

// ── Feed filters ────────────────────────────────────────────────

export type EvalFeedSortBy =
  | 'newest'
  | 'lowest_rated'
  | 'lowest_confidence'
  | 'slowest'
  | 'most_flagged';

export type EvalFeedStatus = 'unreviewed' | 'reviewed' | 'flagged' | 'all';

export interface EvalFeedFilters {
  dateRange?: { start: string; end: string };
  status?: EvalFeedStatus;
  minUserRating?: number;
  maxUserRating?: number;
  adminVerdict?: string;
  qualityFlags?: string[];
  userRole?: string;
  lensId?: string;
  search?: string;
  sortBy?: EvalFeedSortBy;
  cursor?: string;
  limit?: number;
}

export interface EvalFeedResult {
  turns: EvalTurn[];
  cursor: string | null;
  hasMore: boolean;
}

// ── getEvalFeed ─────────────────────────────────────────────────

export async function getEvalFeed(
  tenantId: string | null, // null = cross-tenant (admin only)
  filters: EvalFeedFilters = {},
): Promise<EvalFeedResult> {
  const {
    dateRange,
    status,
    minUserRating,
    maxUserRating,
    adminVerdict,
    qualityFlags,
    userRole,
    lensId,
    search,
    sortBy = 'newest',
    cursor,
    limit = 50,
  } = filters;

  const pageSize = Math.min(limit, 100);

  const conditions: ReturnType<typeof eq>[] = [];

  if (tenantId) {
    conditions.push(eq(semanticEvalTurns.tenantId, tenantId));
  }

  if (dateRange?.start) {
    conditions.push(gte(semanticEvalTurns.createdAt, new Date(dateRange.start)));
  }
  if (dateRange?.end) {
    conditions.push(lte(semanticEvalTurns.createdAt, new Date(dateRange.end)));
  }

  if (status === 'unreviewed') {
    conditions.push(sql`${semanticEvalTurns.adminReviewedAt} IS NULL`);
  } else if (status === 'reviewed') {
    conditions.push(isNotNull(semanticEvalTurns.adminReviewedAt));
  } else if (status === 'flagged') {
    conditions.push(
      sql`${semanticEvalTurns.qualityFlags} IS NOT NULL AND jsonb_array_length(${semanticEvalTurns.qualityFlags}) > 0`,
    );
  }

  if (minUserRating !== undefined) {
    conditions.push(gte(semanticEvalTurns.userRating, minUserRating));
  }
  if (maxUserRating !== undefined) {
    conditions.push(lte(semanticEvalTurns.userRating, maxUserRating));
  }

  if (adminVerdict) {
    conditions.push(eq(semanticEvalTurns.adminVerdict, adminVerdict));
  }

  if (qualityFlags && qualityFlags.length > 0) {
    // Match any turn whose qualityFlags array contains any of the requested flags
    const flagConditions = qualityFlags.map(
      (f) => sql`${semanticEvalTurns.qualityFlags} @> ${JSON.stringify([f])}::jsonb`,
    );
    conditions.push(sql`(${sql.join(flagConditions, sql` OR `)})`);
  }

  if (userRole) {
    conditions.push(eq(semanticEvalTurns.userRole, userRole));
  }

  if (lensId) {
    conditions.push(eq(semanticEvalTurns.narrativeLensId, lensId));
  }

  if (search) {
    conditions.push(like(semanticEvalTurns.userMessage, `%${search}%`));
  }

  // Cursor-based pagination
  if (cursor) {
    conditions.push(lte(semanticEvalTurns.id, cursor));
  }

  const orderExpr = (() => {
    switch (sortBy) {
      case 'lowest_rated':
        return [asc(semanticEvalTurns.userRating), desc(semanticEvalTurns.createdAt)];
      case 'lowest_confidence':
        return [asc(semanticEvalTurns.llmConfidence), desc(semanticEvalTurns.createdAt)];
      case 'slowest':
        return [desc(semanticEvalTurns.executionTimeMs), desc(semanticEvalTurns.createdAt)];
      case 'newest':
      default:
        return [desc(semanticEvalTurns.createdAt), desc(semanticEvalTurns.id)];
    }
  })();

  const rows = await db
    .select()
    .from(semanticEvalTurns)
    .where(and(...conditions))
    .orderBy(...orderExpr)
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;

  return {
    turns: items.map(mapTurn),
    cursor: hasMore ? items[items.length - 1]!.id : null,
    hasMore,
  };
}

// ── getEvalTurnDetail ───────────────────────────────────────────

export async function getEvalTurnDetail(evalTurnId: string): Promise<EvalTurn | null> {
  const [row] = await db
    .select()
    .from(semanticEvalTurns)
    .where(eq(semanticEvalTurns.id, evalTurnId))
    .limit(1);

  return row ? mapTurn(row) : null;
}

// ── getEvalSession ──────────────────────────────────────────────

export async function getEvalSession(
  sessionId: string,
): Promise<{ session: EvalSession; turns: EvalTurn[] } | null> {
  const [session] = await db
    .select()
    .from(semanticEvalSessions)
    .where(eq(semanticEvalSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  const turns = await db
    .select()
    .from(semanticEvalTurns)
    .where(eq(semanticEvalTurns.sessionId, sessionId))
    .orderBy(asc(semanticEvalTurns.turnNumber));

  return {
    session: mapSession(session),
    turns: turns.map(mapTurn),
  };
}

// ── getQualityDashboard ─────────────────────────────────────────

export interface QualityDashboardData {
  overallAvgUserRating: number | null;
  overallAvgAdminScore: number | null;
  ratingDistribution: Record<string, number>;
  confidenceDistribution: { range: string; count: number }[];
  topFailureReasons: { reason: string; count: number }[];
  hallucinationRateTrend: { date: string; rate: number }[];
  clarificationRateTrend: { date: string; rate: number }[];
  avgExecutionTimeTrend: { date: string; avgMs: number }[];
  cacheHitRate: number | null;
  qualityScoreDistribution: { range: string; count: number }[];
  byLens: { lensId: string | null; count: number; avgRating: number | null; topVerdict: string | null }[];
  totalTurns: number;
  reviewedTurns: number;
  flaggedTurns: number;
}

export async function getQualityDashboard(
  tenantId: string | null,
  dateRange: { start: string; end: string },
): Promise<QualityDashboardData> {
  const tenantFilter = tenantId
    ? sql`AND tenant_id = ${tenantId}`
    : sql``;

  const summary = await db.execute<{
    avg_user_rating: string | null;
    avg_admin_score: string | null;
    total_turns: string;
    reviewed_turns: string;
    flagged_turns: string;
    cache_hit_rate: string | null;
  }>(
    sql`SELECT
      AVG(user_rating)::NUMERIC(3,2) as avg_user_rating,
      AVG(admin_score)::NUMERIC(3,2) as avg_admin_score,
      COUNT(*) as total_turns,
      COUNT(*) FILTER (WHERE admin_reviewed_at IS NOT NULL) as reviewed_turns,
      COUNT(*) FILTER (WHERE quality_flags IS NOT NULL AND jsonb_array_length(quality_flags) > 0) as flagged_turns,
      (COUNT(*) FILTER (WHERE cache_status = 'HIT')::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE cache_status IS NOT NULL), 0) * 100)::NUMERIC(5,2) as cache_hit_rate
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      ${tenantFilter}`,
  );

  const summaryRow = Array.from(summary as Iterable<{
    avg_user_rating: string | null;
    avg_admin_score: string | null;
    total_turns: string;
    reviewed_turns: string;
    flagged_turns: string;
    cache_hit_rate: string | null;
  }>)[0];

  // Rating distribution
  const ratingRows = await db.execute<{ rating: string; count: string }>(
    sql`SELECT user_rating::TEXT as rating, COUNT(*) as count
        FROM semantic_eval_turns
        WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
          AND user_rating IS NOT NULL
          ${tenantFilter}
        GROUP BY user_rating`,
  );

  const ratingDist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  for (const row of Array.from(ratingRows as Iterable<{ rating: string; count: string }>)) {
    ratingDist[row.rating] = parseInt(row.count, 10);
  }

  // Hallucination rate trend
  const hallucinationTrend = await db.execute<{ date: string; rate: string }>(
    sql`SELECT
      DATE(created_at) as date,
      (COUNT(*) FILTER (WHERE quality_flags @> '["hallucinated_slug"]'::jsonb)::NUMERIC / NULLIF(COUNT(*), 0) * 100)::NUMERIC(5,2) as rate
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      ${tenantFilter}
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at)`,
  );

  // Clarification rate trend
  const clarificationTrend = await db.execute<{ date: string; rate: string }>(
    sql`SELECT
      DATE(created_at) as date,
      (COUNT(*) FILTER (WHERE was_clarification = TRUE)::NUMERIC / NULLIF(COUNT(*), 0) * 100)::NUMERIC(5,2) as rate
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      ${tenantFilter}
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at)`,
  );

  // Avg execution time trend
  const execTimeTrend = await db.execute<{ date: string; avg_ms: string }>(
    sql`SELECT
      DATE(created_at) as date,
      AVG(execution_time_ms)::INTEGER as avg_ms
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      AND execution_time_ms IS NOT NULL
      ${tenantFilter}
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at)`,
  );

  // By lens breakdown
  const byLens = await db.execute<{
    lens_id: string | null;
    count: string;
    avg_rating: string | null;
    top_verdict: string | null;
  }>(
    sql`SELECT
      narrative_lens_id as lens_id,
      COUNT(*) as count,
      AVG(user_rating)::NUMERIC(3,2) as avg_rating,
      MODE() WITHIN GROUP (ORDER BY admin_verdict) as top_verdict
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      ${tenantFilter}
    GROUP BY narrative_lens_id`,
  );

  return {
    overallAvgUserRating: summaryRow?.avg_user_rating ? Number(summaryRow.avg_user_rating) : null,
    overallAvgAdminScore: summaryRow?.avg_admin_score ? Number(summaryRow.avg_admin_score) : null,
    ratingDistribution: ratingDist,
    confidenceDistribution: [],
    topFailureReasons: [],
    hallucinationRateTrend: Array.from(hallucinationTrend as Iterable<{ date: string; rate: string }>).map((r) => ({
      date: r.date,
      rate: Number(r.rate),
    })),
    clarificationRateTrend: Array.from(clarificationTrend as Iterable<{ date: string; rate: string }>).map((r) => ({
      date: r.date,
      rate: Number(r.rate),
    })),
    avgExecutionTimeTrend: Array.from(execTimeTrend as Iterable<{ date: string; avg_ms: string }>).map((r) => ({
      date: r.date,
      avgMs: Number(r.avg_ms),
    })),
    cacheHitRate: summaryRow?.cache_hit_rate ? Number(summaryRow.cache_hit_rate) : null,
    qualityScoreDistribution: [],
    byLens: Array.from(byLens as Iterable<{ lens_id: string | null; count: string; avg_rating: string | null; top_verdict: string | null }>).map((r) => ({
      lensId: r.lens_id,
      count: parseInt(r.count, 10),
      avgRating: r.avg_rating ? Number(r.avg_rating) : null,
      topVerdict: r.top_verdict,
    })),
    totalTurns: summaryRow ? parseInt(summaryRow.total_turns, 10) : 0,
    reviewedTurns: summaryRow ? parseInt(summaryRow.reviewed_turns, 10) : 0,
    flaggedTurns: summaryRow ? parseInt(summaryRow.flagged_turns, 10) : 0,
  };
}

// ── getGoldenExamples ───────────────────────────────────────────

export async function getGoldenExamples(
  tenantId?: string,
  category?: ExampleCategory,
  difficulty?: ExampleDifficulty,
): Promise<EvalExample[]> {
  const conditions = [eq(semanticEvalExamples.isActive, true)];

  if (tenantId) {
    conditions.push(
      sql`(${semanticEvalExamples.tenantId} IS NULL OR ${semanticEvalExamples.tenantId} = ${tenantId})`,
    );
  } else {
    conditions.push(sql`${semanticEvalExamples.tenantId} IS NULL`);
  }

  if (category) {
    conditions.push(eq(semanticEvalExamples.category, category));
  }
  if (difficulty) {
    conditions.push(eq(semanticEvalExamples.difficulty, difficulty));
  }

  const rows = await db
    .select()
    .from(semanticEvalExamples)
    .where(and(...conditions))
    .orderBy(desc(semanticEvalExamples.qualityScore))
    .limit(100);

  return rows.map(mapExample);
}

// ── getProblematicPatterns ──────────────────────────────────────

export interface ProblematicPattern {
  planHash: string;
  count: number;
  avgUserRating: number | null;
  avgAdminScore: number | null;
  sampleQuestion: string;
  commonVerdicts: string[];
  commonFlags: string[];
}

export async function getProblematicPatterns(
  tenantId: string | null,
  dateRange: { start: string; end: string },
): Promise<ProblematicPattern[]> {
  const tenantFilter = tenantId
    ? sql`AND tenant_id = ${tenantId}`
    : sql``;

  const rows = await db.execute<{
    plan_hash: string;
    count: string;
    avg_user_rating: string | null;
    avg_admin_score: string | null;
    sample_question: string;
  }>(
    sql`SELECT
      plan_hash,
      COUNT(*) as count,
      AVG(user_rating)::NUMERIC(3,2) as avg_user_rating,
      AVG(admin_score)::NUMERIC(3,2) as avg_admin_score,
      MIN(user_message) as sample_question
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      AND plan_hash IS NOT NULL
      ${tenantFilter}
    GROUP BY plan_hash
    HAVING COUNT(*) >= 3
       AND (AVG(user_rating) < 3 OR AVG(admin_score) < 3)
    ORDER BY count DESC
    LIMIT 20`,
  );

  return Array.from(rows as Iterable<{
    plan_hash: string;
    count: string;
    avg_user_rating: string | null;
    avg_admin_score: string | null;
    sample_question: string;
  }>).map((r) => ({
    planHash: r.plan_hash,
    count: parseInt(r.count, 10),
    avgUserRating: r.avg_user_rating ? Number(r.avg_user_rating) : null,
    avgAdminScore: r.avg_admin_score ? Number(r.avg_admin_score) : null,
    sampleQuestion: r.sample_question,
    commonVerdicts: [],
    commonFlags: [],
  }));
}

// ── getComparativeAnalysis ──────────────────────────────────────

export interface ComparativeAnalysis {
  byProvider: {
    provider: string;
    count: number;
    avgRating: number | null;
    avgLatencyMs: number | null;
    avgTokens: number | null;
  }[];
  byModel: {
    model: string;
    count: number;
    avgRating: number | null;
    avgLatencyMs: number | null;
    avgTokens: number | null;
  }[];
  byLens: {
    lensId: string | null;
    count: number;
    avgRating: number | null;
    avgAdminScore: number | null;
  }[];
}

export async function getComparativeAnalysis(
  tenantId: string | null,
  dateRange: { start: string; end: string },
): Promise<ComparativeAnalysis> {
  const tenantFilter = tenantId ? sql`AND tenant_id = ${tenantId}` : sql``;

  const providerRows = await db.execute<{
    provider: string;
    count: string;
    avg_rating: string | null;
    avg_latency_ms: string | null;
    avg_tokens: string | null;
  }>(
    sql`SELECT
      llm_provider as provider,
      COUNT(*) as count,
      AVG(user_rating)::NUMERIC(3,2) as avg_rating,
      AVG(llm_latency_ms)::INTEGER as avg_latency_ms,
      AVG(llm_tokens_input + llm_tokens_output)::INTEGER as avg_tokens
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      AND llm_provider IS NOT NULL
      ${tenantFilter}
    GROUP BY llm_provider`,
  );

  const modelRows = await db.execute<{
    model: string;
    count: string;
    avg_rating: string | null;
    avg_latency_ms: string | null;
    avg_tokens: string | null;
  }>(
    sql`SELECT
      llm_model as model,
      COUNT(*) as count,
      AVG(user_rating)::NUMERIC(3,2) as avg_rating,
      AVG(llm_latency_ms)::INTEGER as avg_latency_ms,
      AVG(llm_tokens_input + llm_tokens_output)::INTEGER as avg_tokens
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      AND llm_model IS NOT NULL
      ${tenantFilter}
    GROUP BY llm_model`,
  );

  const lensRows = await db.execute<{
    lens_id: string | null;
    count: string;
    avg_rating: string | null;
    avg_admin_score: string | null;
  }>(
    sql`SELECT
      narrative_lens_id as lens_id,
      COUNT(*) as count,
      AVG(user_rating)::NUMERIC(3,2) as avg_rating,
      AVG(admin_score)::NUMERIC(3,2) as avg_admin_score
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      ${tenantFilter}
    GROUP BY narrative_lens_id`,
  );

  return {
    byProvider: Array.from(providerRows as Iterable<{ provider: string; count: string; avg_rating: string | null; avg_latency_ms: string | null; avg_tokens: string | null }>).map((r) => ({
      provider: r.provider,
      count: parseInt(r.count, 10),
      avgRating: r.avg_rating ? Number(r.avg_rating) : null,
      avgLatencyMs: r.avg_latency_ms ? Number(r.avg_latency_ms) : null,
      avgTokens: r.avg_tokens ? Number(r.avg_tokens) : null,
    })),
    byModel: Array.from(modelRows as Iterable<{ model: string; count: string; avg_rating: string | null; avg_latency_ms: string | null; avg_tokens: string | null }>).map((r) => ({
      model: r.model,
      count: parseInt(r.count, 10),
      avgRating: r.avg_rating ? Number(r.avg_rating) : null,
      avgLatencyMs: r.avg_latency_ms ? Number(r.avg_latency_ms) : null,
      avgTokens: r.avg_tokens ? Number(r.avg_tokens) : null,
    })),
    byLens: Array.from(lensRows as Iterable<{ lens_id: string | null; count: string; avg_rating: string | null; avg_admin_score: string | null }>).map((r) => ({
      lensId: r.lens_id,
      count: parseInt(r.count, 10),
      avgRating: r.avg_rating ? Number(r.avg_rating) : null,
      avgAdminScore: r.avg_admin_score ? Number(r.avg_admin_score) : null,
    })),
  };
}

// ── Row mappers ─────────────────────────────────────────────────

function mapTurn(row: typeof semanticEvalTurns.$inferSelect): EvalTurn {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionId: row.sessionId,
    userId: row.userId,
    userRole: row.userRole,
    turnNumber: row.turnNumber,
    userMessage: row.userMessage,
    contextSnapshot: row.contextSnapshot as Record<string, unknown> | null,
    llmProvider: row.llmProvider,
    llmModel: row.llmModel,
    llmPlan: row.llmPlan as Record<string, unknown> | null,
    llmRationale: row.llmRationale as Record<string, unknown> | null,
    llmConfidence: row.llmConfidence !== null ? Number(row.llmConfidence) : null,
    llmTokensInput: row.llmTokensInput,
    llmTokensOutput: row.llmTokensOutput,
    llmLatencyMs: row.llmLatencyMs,
    planHash: row.planHash,
    wasClarification: row.wasClarification,
    clarificationMessage: row.clarificationMessage,
    compiledSql: row.compiledSql,
    sqlHash: row.sqlHash,
    compilationErrors: row.compilationErrors as string[] | null,
    safetyFlags: row.safetyFlags as string[] | null,
    tablesAccessed: row.tablesAccessed as string[] | null,
    executionTimeMs: row.executionTimeMs,
    rowCount: row.rowCount,
    resultSample: row.resultSample as Record<string, unknown>[] | null,
    resultFingerprint: row.resultFingerprint as { rowCount: number; minDate: string | null; maxDate: string | null; nullRate: number; columnCount: number } | null,
    executionError: row.executionError,
    cacheStatus: row.cacheStatus as 'HIT' | 'MISS' | 'SKIP' | null,
    narrative: row.narrative,
    narrativeLensId: row.narrativeLensId,
    responseSections: row.responseSections as string[] | null,
    playbooksFired: row.playbooksFired as string[] | null,
    userRating: row.userRating,
    userThumbsUp: row.userThumbsUp,
    userFeedbackText: row.userFeedbackText,
    userFeedbackTags: row.userFeedbackTags as FeedbackTag[] | null,
    userFeedbackAt: row.userFeedbackAt?.toISOString() ?? null,
    adminReviewerId: row.adminReviewerId,
    adminScore: row.adminScore,
    adminVerdict: row.adminVerdict as 'correct' | 'partially_correct' | 'incorrect' | 'hallucination' | 'needs_improvement' | null,
    adminNotes: row.adminNotes,
    adminCorrectedPlan: row.adminCorrectedPlan as Record<string, unknown> | null,
    adminCorrectedNarrative: row.adminCorrectedNarrative,
    adminReviewedAt: row.adminReviewedAt?.toISOString() ?? null,
    adminActionTaken: row.adminActionTaken as 'none' | 'added_to_examples' | 'adjusted_metric' | 'filed_bug' | 'updated_lens' | null,
    qualityScore: row.qualityScore !== null ? Number(row.qualityScore) : null,
    qualityFlags: row.qualityFlags as QualityFlag[] | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapSession(row: typeof semanticEvalSessions.$inferSelect): EvalSession {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    sessionId: row.sessionId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    messageCount: row.messageCount,
    avgUserRating: row.avgUserRating !== null ? Number(row.avgUserRating) : null,
    avgAdminScore: row.avgAdminScore !== null ? Number(row.avgAdminScore) : null,
    status: row.status as EvalSession['status'],
    lensId: row.lensId,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapExample(row: typeof semanticEvalExamples.$inferSelect): EvalExample {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sourceEvalTurnId: row.sourceEvalTurnId,
    question: row.question,
    plan: row.plan as Record<string, unknown>,
    rationale: row.rationale as Record<string, unknown> | null,
    category: row.category as EvalExample['category'],
    difficulty: row.difficulty as EvalExample['difficulty'],
    qualityScore: row.qualityScore !== null ? Number(row.qualityScore) : null,
    isActive: row.isActive,
    addedBy: row.addedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
