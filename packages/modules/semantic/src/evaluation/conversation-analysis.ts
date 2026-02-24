import { db } from '@oppsera/db';
import { semanticEvalTurns, semanticEvalSessions } from '@oppsera/db';
import { sql, eq, asc } from 'drizzle-orm';
import type { EvalTurn, EvalSession, QualityFlag } from './types';

// ── Types ────────────────────────────────────────────────────────

export interface ConversationDetail {
  session: EvalSession;
  turns: EvalTurn[];
  overallCoherence: number;
  topicFlow: string[];
  abandonmentRisk: boolean;
}

export interface ConversationMetrics {
  avgTurnsPerSession: number;
  avgSessionDurationMs: number | null;
  abandonmentRate: number;
  topicDistribution: { topic: string; count: number }[];
  coherenceScore: number;
  completionRate: number;
}

export interface TopicCluster {
  topic: string;
  count: number;
  avgRating: number | null;
  exampleQuestions: string[];
}

export interface AbandonedSessionSummary {
  sessionId: string;
  tenantId: string;
  firstMessage: string;
  lastMessage: string;
  turnCount: number;
  lastQualityScore: number | null;
  startedAt: string;
}

export interface MultiTurnCoherence {
  coherenceScore: number;
  contextMaintained: boolean;
  topicDriftPoints: number[];
}

export interface SessionFlowTurn {
  turnNumber: number;
  message: string;
  qualityScore: number | null;
  wasClarification: boolean;
  responseType: string;
}

export interface SessionFlow {
  turns: SessionFlowTurn[];
}

// ── getConversationDetail ───────────────────────────────────────

export async function getConversationDetail(
  sessionId: string,
): Promise<ConversationDetail | null> {
  const [sessionRow] = await db
    .select()
    .from(semanticEvalSessions)
    .where(eq(semanticEvalSessions.id, sessionId))
    .limit(1);

  if (!sessionRow) return null;

  const turnRows = await db
    .select()
    .from(semanticEvalTurns)
    .where(eq(semanticEvalTurns.sessionId, sessionId))
    .orderBy(asc(semanticEvalTurns.turnNumber));

  const turns = turnRows.map(mapTurn);

  // Compute topic flow: extract significant keywords from each turn's message
  const topicFlow = turns.map((t) => extractTopicKeyword(t.userMessage));

  // Compute overall coherence
  const overallCoherence = computeCoherenceFromTurns(turns);

  // Determine abandonment risk:
  // short sessions (1-2 turns) with no user rating or bad rating on last turn
  const lastTurn = turns.length > 0 ? turns[turns.length - 1]! : null;
  const abandonmentRisk =
    turns.length <= 2 &&
    lastTurn !== null &&
    (lastTurn.userRating === null || lastTurn.userRating <= 2);

  return {
    session: mapSession(sessionRow),
    turns,
    overallCoherence,
    topicFlow,
    abandonmentRisk,
  };
}

// ── getConversationMetrics ──────────────────────────────────────

export async function getConversationMetrics(
  tenantId: string | null,
  dateRange: { start: string; end: string },
): Promise<ConversationMetrics> {
  const tenantFilter = tenantId ? sql`AND s.tenant_id = ${tenantId}` : sql``;

  // Session-level aggregates
  const summaryRows = await db.execute<{
    total_sessions: string;
    avg_turns: string;
    avg_duration_ms: string | null;
    abandoned_sessions: string;
    completed_sessions: string;
  }>(
    sql`SELECT
      COUNT(*) as total_sessions,
      AVG(s.message_count)::NUMERIC(5,1) as avg_turns,
      AVG(
        CASE WHEN s.ended_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) * 1000
          ELSE NULL
        END
      )::INTEGER as avg_duration_ms,
      COUNT(*) FILTER (WHERE s.message_count <= 2) as abandoned_sessions,
      COUNT(*) FILTER (
        WHERE s.message_count > 0
          AND EXISTS (
            SELECT 1 FROM semantic_eval_turns t
            WHERE t.session_id = s.id
              AND t.turn_number = s.message_count
              AND t.user_rating >= 4
          )
      ) as completed_sessions
    FROM semantic_eval_sessions s
    WHERE s.message_count > 0
      AND s.started_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      ${tenantFilter}`,
  );

  const summary = Array.from(summaryRows as Iterable<{
    total_sessions: string;
    avg_turns: string;
    avg_duration_ms: string | null;
    abandoned_sessions: string;
    completed_sessions: string;
  }>)[0];

  const totalSessions = summary ? parseInt(summary.total_sessions, 10) : 0;
  const abandonedSessions = summary ? parseInt(summary.abandoned_sessions, 10) : 0;
  const completedSessions = summary ? parseInt(summary.completed_sessions, 10) : 0;

  // Topic distribution from user messages in the date range
  const topicRows = await db.execute<{
    user_message: string;
  }>(
    sql`SELECT t.user_message
        FROM semantic_eval_turns t
        JOIN semantic_eval_sessions s ON s.id = t.session_id
        WHERE s.started_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
          AND t.turn_number = 1
          ${tenantFilter ? sql`AND s.tenant_id = ${tenantId}` : sql``}
        LIMIT 1000`,
  );

  const messages = Array.from(topicRows as Iterable<{ user_message: string }>);
  const topicDistribution = buildTopicDistribution(messages.map((m) => m.user_message));

  // Coherence score: average quality score across multi-turn sessions
  const coherenceRows = await db.execute<{ avg_quality: string | null }>(
    sql`SELECT AVG(t.quality_score)::NUMERIC(3,2) as avg_quality
        FROM semantic_eval_turns t
        JOIN semantic_eval_sessions s ON s.id = t.session_id
        WHERE s.message_count >= 3
          AND s.started_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
          AND t.quality_score IS NOT NULL
          ${tenantFilter ? sql`AND s.tenant_id = ${tenantId}` : sql``}`,
  );

  const coherenceResult = Array.from(coherenceRows as Iterable<{ avg_quality: string | null }>)[0];

  return {
    avgTurnsPerSession: summary ? Number(summary.avg_turns) : 0,
    avgSessionDurationMs: summary?.avg_duration_ms ? Number(summary.avg_duration_ms) : null,
    abandonmentRate: totalSessions > 0 ? Math.round((abandonedSessions / totalSessions) * 100) / 100 : 0,
    topicDistribution,
    coherenceScore: coherenceResult?.avg_quality ? Number(coherenceResult.avg_quality) : 0,
    completionRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) / 100 : 0,
  };
}

// ── getTopicClusters ────────────────────────────────────────────

export async function getTopicClusters(
  tenantId: string | null,
  dateRange: { start: string; end: string },
  maxClusters: number = 20,
): Promise<TopicCluster[]> {
  const tenantFilter = tenantId ? sql`AND s.tenant_id = ${tenantId}` : sql``;

  // Fetch first messages from sessions in range (these define the "topic")
  const rows = await db.execute<{
    user_message: string;
    user_rating: string | null;
  }>(
    sql`SELECT t.user_message, t.user_rating::TEXT
        FROM semantic_eval_turns t
        JOIN semantic_eval_sessions s ON s.id = t.session_id
        WHERE t.turn_number = 1
          AND s.started_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
          ${tenantFilter}
        LIMIT 5000`,
  );

  const items = Array.from(rows as Iterable<{
    user_message: string;
    user_rating: string | null;
  }>);

  if (items.length === 0) return [];

  // Cluster by keyword overlap
  const clusters = new Map<string, {
    count: number;
    ratings: number[];
    examples: string[];
  }>();

  for (const item of items) {
    const topic = extractTopicKeyword(item.user_message);
    const existing = clusters.get(topic);

    if (existing) {
      existing.count++;
      if (item.user_rating !== null) {
        existing.ratings.push(parseInt(item.user_rating, 10));
      }
      if (existing.examples.length < 3) {
        existing.examples.push(item.user_message);
      }
    } else {
      clusters.set(topic, {
        count: 1,
        ratings: item.user_rating !== null ? [parseInt(item.user_rating, 10)] : [],
        examples: [item.user_message],
      });
    }
  }

  // Sort by count descending, take top N
  const sorted = Array.from(clusters.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, maxClusters);

  return sorted.map(([topic, data]) => ({
    topic,
    count: data.count,
    avgRating:
      data.ratings.length > 0
        ? Math.round((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length) * 100) / 100
        : null,
    exampleQuestions: data.examples,
  }));
}

// ── getAbandonedSessions ────────────────────────────────────────

export async function getAbandonedSessions(
  tenantId: string | null,
  dateRange: { start: string; end: string },
): Promise<AbandonedSessionSummary[]> {
  const tenantFilter = tenantId ? sql`AND s.tenant_id = ${tenantId}` : sql``;

  const rows = await db.execute<{
    session_id: string;
    tenant_id: string;
    message_count: string;
    started_at: string;
    first_message: string | null;
    last_message: string | null;
    last_quality_score: string | null;
    last_user_rating: string | null;
  }>(
    sql`SELECT
      s.id as session_id,
      s.tenant_id,
      s.message_count,
      s.started_at::TEXT as started_at,
      (
        SELECT t.user_message FROM semantic_eval_turns t
        WHERE t.session_id = s.id
        ORDER BY t.turn_number ASC LIMIT 1
      ) as first_message,
      (
        SELECT t.user_message FROM semantic_eval_turns t
        WHERE t.session_id = s.id
        ORDER BY t.turn_number DESC LIMIT 1
      ) as last_message,
      (
        SELECT t.quality_score FROM semantic_eval_turns t
        WHERE t.session_id = s.id
        ORDER BY t.turn_number DESC LIMIT 1
      ) as last_quality_score,
      (
        SELECT t.user_rating::TEXT FROM semantic_eval_turns t
        WHERE t.session_id = s.id
        ORDER BY t.turn_number DESC LIMIT 1
      ) as last_user_rating
    FROM semantic_eval_sessions s
    WHERE s.message_count BETWEEN 1 AND 2
      AND s.started_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      ${tenantFilter}
    HAVING (
      SELECT t.user_rating FROM semantic_eval_turns t
      WHERE t.session_id = s.id
      ORDER BY t.turn_number DESC LIMIT 1
    ) IS NULL
    OR (
      SELECT t.user_rating FROM semantic_eval_turns t
      WHERE t.session_id = s.id
      ORDER BY t.turn_number DESC LIMIT 1
    ) <= 2
    ORDER BY s.started_at DESC
    LIMIT 100`,
  );

  const items = Array.from(rows as Iterable<{
    session_id: string;
    tenant_id: string;
    message_count: string;
    started_at: string;
    first_message: string | null;
    last_message: string | null;
    last_quality_score: string | null;
    last_user_rating: string | null;
  }>);

  return items.map((r) => ({
    sessionId: r.session_id,
    tenantId: r.tenant_id,
    firstMessage: r.first_message ?? '',
    lastMessage: r.last_message ?? '',
    turnCount: parseInt(r.message_count, 10),
    lastQualityScore: r.last_quality_score ? Number(r.last_quality_score) : null,
    startedAt: r.started_at,
  }));
}

// ── getMultiTurnCoherence ───────────────────────────────────────

export async function getMultiTurnCoherence(
  sessionId: string,
): Promise<MultiTurnCoherence | null> {
  const turnRows = await db
    .select()
    .from(semanticEvalTurns)
    .where(eq(semanticEvalTurns.sessionId, sessionId))
    .orderBy(asc(semanticEvalTurns.turnNumber));

  if (turnRows.length === 0) return null;

  const turns = turnRows.map(mapTurn);

  // Detect topic drift: compare keywords of consecutive turns
  const topicDriftPoints: number[] = [];
  let contextMaintained = true;

  for (let i = 1; i < turns.length; i++) {
    const prevKeywords = extractKeywords(turns[i - 1]!.userMessage);
    const currKeywords = extractKeywords(turns[i]!.userMessage);

    // Check keyword overlap between consecutive turns
    const overlap = prevKeywords.filter((k) => currKeywords.includes(k)).length;
    const maxPossible = Math.max(prevKeywords.length, currKeywords.length, 1);
    const overlapRatio = overlap / maxPossible;

    // A follow-up question typically references prior context
    const isFollowUp =
      overlapRatio > 0.2 ||
      turns[i]!.userMessage.toLowerCase().startsWith('what about') ||
      turns[i]!.userMessage.toLowerCase().startsWith('and ') ||
      turns[i]!.userMessage.toLowerCase().startsWith('how about') ||
      turns[i]!.userMessage.toLowerCase().startsWith('also ') ||
      turns[i]!.userMessage.toLowerCase().startsWith('what if') ||
      turns[i]!.userMessage.toLowerCase().includes('compared to');

    if (!isFollowUp) {
      topicDriftPoints.push(turns[i]!.turnNumber);
      contextMaintained = false;
    }
  }

  // Coherence score: 1.0 = no drift, decreases with each drift point
  const maxTurns = Math.max(turns.length - 1, 1);
  const coherenceScore =
    Math.round(((maxTurns - topicDriftPoints.length) / maxTurns) * 100) / 100;

  return {
    coherenceScore: Math.max(0, coherenceScore),
    contextMaintained,
    topicDriftPoints,
  };
}

// ── getSessionFlow ─────────────────────────────────────────────

export async function getSessionFlow(
  sessionId: string,
): Promise<SessionFlow | null> {
  const turnRows = await db
    .select()
    .from(semanticEvalTurns)
    .where(eq(semanticEvalTurns.sessionId, sessionId))
    .orderBy(asc(semanticEvalTurns.turnNumber));

  if (turnRows.length === 0) return null;

  const turns: SessionFlowTurn[] = turnRows.map((row) => {
    // Determine response type
    let responseType = 'data';
    if (row.wasClarification) {
      responseType = 'clarification';
    } else if (row.executionError) {
      responseType = 'error';
    } else if (row.rowCount === 0) {
      responseType = 'empty';
    } else if (row.narrative && !row.compiledSql) {
      responseType = 'advisory';
    }

    // Truncate message for visualization
    const maxLen = 120;
    const message =
      row.userMessage.length > maxLen
        ? row.userMessage.substring(0, maxLen) + '...'
        : row.userMessage;

    return {
      turnNumber: row.turnNumber,
      message,
      qualityScore: row.qualityScore !== null ? Number(row.qualityScore) : null,
      wasClarification: row.wasClarification,
      responseType,
    };
  });

  return { turns };
}

// ── Helpers ─────────────────────────────────────────────────────

// Common stop words to filter out of topic extraction
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'must', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'out',
  'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'it',
  'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we',
  'our', 'you', 'your', 'he', 'she', 'they', 'them', 'their', 'what',
  'which', 'who', 'whom', 'show', 'tell', 'give', 'get', 'many',
  'much', 'any', 'also', 'well', 'still', 'already', 'yet', 'even',
  'back', 'make', 'like', 'know', 'want', 'see', 'look', 'think',
  'come', 'take', 'find', 'going', 'go', 'say', 'said', 'let',
]);

/**
 * Extract keywords from a message, filtering out stop words and short words.
 */
function extractKeywords(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Extract the most representative topic keyword from a message.
 * Returns the first significant keyword that appears in the message.
 */
function extractTopicKeyword(message: string): string {
  const keywords = extractKeywords(message);

  // Known business topic keywords to prefer
  const businessTopics = [
    'sales', 'revenue', 'orders', 'inventory', 'stock', 'customers',
    'profit', 'margin', 'cost', 'expenses', 'discount', 'average',
    'trend', 'compare', 'performance', 'top', 'best', 'worst',
    'forecast', 'growth', 'decline', 'category', 'department',
    'items', 'products', 'payments', 'tenders', 'tips', 'golf',
    'tee', 'rounds', 'utilization', 'occupancy', 'covers', 'turns',
    'labor', 'employees', 'staff', 'schedule', 'shift',
  ];

  for (const keyword of keywords) {
    if (businessTopics.includes(keyword)) {
      return keyword;
    }
  }

  // Fall back to first keyword if no business topic found
  return keywords[0] ?? 'general';
}

/**
 * Build topic distribution from an array of first-turn messages.
 * Groups by extracted topic keyword and counts occurrences.
 */
function buildTopicDistribution(
  messages: string[],
): { topic: string; count: number }[] {
  const topicCounts = new Map<string, number>();

  for (const message of messages) {
    const topic = extractTopicKeyword(message);
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
  }

  return Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Compute coherence score from a sequence of turns.
 * Higher score = more topically coherent conversation.
 */
function computeCoherenceFromTurns(turns: EvalTurn[]): number {
  if (turns.length <= 1) return 1.0;

  let coherentPairs = 0;
  const totalPairs = turns.length - 1;

  for (let i = 1; i < turns.length; i++) {
    const prevKeywords = extractKeywords(turns[i - 1]!.userMessage);
    const currKeywords = extractKeywords(turns[i]!.userMessage);

    const overlap = prevKeywords.filter((k) => currKeywords.includes(k)).length;
    if (overlap > 0 || turns[i]!.wasClarification) {
      coherentPairs++;
    }
  }

  return Math.round((coherentPairs / totalPairs) * 100) / 100;
}

// ── Row mappers (matching queries.ts pattern) ───────────────────

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
    resultFingerprint: row.resultFingerprint as {
      rowCount: number;
      minDate: string | null;
      maxDate: string | null;
      nullRate: number;
      columnCount: number;
    } | null,
    executionError: row.executionError,
    cacheStatus: row.cacheStatus as 'HIT' | 'MISS' | 'SKIP' | null,
    narrative: row.narrative,
    narrativeLensId: row.narrativeLensId,
    responseSections: row.responseSections as string[] | null,
    playbooksFired: row.playbooksFired as string[] | null,
    userRating: row.userRating,
    userThumbsUp: row.userThumbsUp,
    userFeedbackText: row.userFeedbackText,
    userFeedbackTags: row.userFeedbackTags as EvalTurn['userFeedbackTags'],
    userFeedbackAt: row.userFeedbackAt?.toISOString() ?? null,
    adminReviewerId: row.adminReviewerId,
    adminScore: row.adminScore,
    adminVerdict: row.adminVerdict as EvalTurn['adminVerdict'],
    adminNotes: row.adminNotes,
    adminCorrectedPlan: row.adminCorrectedPlan as Record<string, unknown> | null,
    adminCorrectedNarrative: row.adminCorrectedNarrative,
    adminReviewedAt: row.adminReviewedAt?.toISOString() ?? null,
    adminActionTaken: row.adminActionTaken as EvalTurn['adminActionTaken'],
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
