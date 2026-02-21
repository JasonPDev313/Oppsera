import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Semantic Eval Sessions ──────────────────────────────────────
// One row per conversation / query session for evaluation tracking

export const semanticEvalSessions = pgTable(
  'semantic_eval_sessions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id'),
    // FK to ai_conversations if exists, otherwise standalone
    sessionId: text('session_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    messageCount: integer('message_count').notNull().default(0),
    // Rolling averages — computed on each new rating
    avgUserRating: numeric('avg_user_rating', { precision: 3, scale: 2 }),
    avgAdminScore: numeric('avg_admin_score', { precision: 3, scale: 2 }),
    status: text('status').notNull().default('active'), // 'active' | 'completed' | 'flagged' | 'reviewed'
    lensId: text('lens_id'),
    metadata: jsonb('metadata'), // { businessType, userRole, locationId, etc. }
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_eval_sessions_tenant_user').on(table.tenantId, table.userId),
    index('idx_eval_sessions_tenant_status').on(table.tenantId, table.status),
    index('idx_eval_sessions_session_id').on(table.sessionId),
  ],
);

// ── Semantic Eval Turns ─────────────────────────────────────────
// Core evaluation table — one row per question→response cycle

export const semanticEvalTurns = pgTable(
  'semantic_eval_turns',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    sessionId: text('session_id')
      .notNull()
      .references(() => semanticEvalSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id'),
    // Cached at write time so we can analyze by role even if role changes later
    userRole: text('user_role'),
    turnNumber: integer('turn_number').notNull().default(1),

    // ── Input capture ────────────────────────────────────────────
    userMessage: text('user_message').notNull(),
    contextSnapshot: jsonb('context_snapshot'), // { locationId, dateRange, sessionContext }

    // ── LLM plan capture ─────────────────────────────────────────
    llmProvider: text('llm_provider'), // 'openai' | 'anthropic'
    llmModel: text('llm_model'),
    llmPlan: jsonb('llm_plan'), // full QueryPlan JSON
    llmRationale: jsonb('llm_rationale'), // full PlanRationale JSON
    llmConfidence: numeric('llm_confidence', { precision: 3, scale: 2 }), // 0.00–1.00
    llmTokensInput: integer('llm_tokens_input'),
    llmTokensOutput: integer('llm_tokens_output'),
    llmLatencyMs: integer('llm_latency_ms'),
    planHash: text('plan_hash'), // stable SHA-256 of normalized plan for dedup/grouping
    wasClarification: boolean('was_clarification').notNull().default(false),
    clarificationMessage: text('clarification_message'),

    // ── Compilation capture ───────────────────────────────────────
    compiledSql: text('compiled_sql'),
    sqlHash: text('sql_hash'),
    compilationErrors: jsonb('compilation_errors'), // string[]
    safetyFlags: jsonb('safety_flags'), // string[]
    tablesAccessed: jsonb('tables_accessed'), // string[]

    // ── Execution capture ─────────────────────────────────────────
    executionTimeMs: integer('execution_time_ms'),
    rowCount: integer('row_count'),
    resultSample: jsonb('result_sample'), // first 5 rows
    resultFingerprint: jsonb('result_fingerprint'), // { rowCount, minDate, maxDate, nullRate, columnCount }
    executionError: text('execution_error'),
    cacheStatus: text('cache_status'), // 'HIT' | 'MISS' | 'SKIP'

    // ── Response capture ──────────────────────────────────────────
    narrative: text('narrative'),
    narrativeLensId: text('narrative_lens_id'),
    responseSections: jsonb('response_sections'), // string[]
    playbooksFired: jsonb('playbooks_fired'), // string[]

    // ── User feedback ─────────────────────────────────────────────
    userRating: integer('user_rating'), // 1-5 stars
    userThumbsUp: boolean('user_thumbs_up'),
    userFeedbackText: text('user_feedback_text'),
    userFeedbackTags: jsonb('user_feedback_tags'), // string[]
    userFeedbackAt: timestamp('user_feedback_at', { withTimezone: true }),

    // ── Admin review ──────────────────────────────────────────────
    adminReviewerId: text('admin_reviewer_id'),
    adminScore: integer('admin_score'), // 1-5
    adminVerdict: text('admin_verdict'), // 'correct' | 'partially_correct' | 'incorrect' | 'hallucination' | 'needs_improvement'
    adminNotes: text('admin_notes'),
    adminCorrectedPlan: jsonb('admin_corrected_plan'),
    adminCorrectedNarrative: text('admin_corrected_narrative'),
    adminReviewedAt: timestamp('admin_reviewed_at', { withTimezone: true }),
    adminActionTaken: text('admin_action_taken'), // 'none' | 'added_to_examples' | 'adjusted_metric' | 'filed_bug' | 'updated_lens'

    // ── Quality signals (computed/derived) ────────────────────────
    // 40% admin score + 30% user rating + 30% heuristics
    qualityScore: numeric('quality_score', { precision: 3, scale: 2 }),
    qualityFlags: jsonb('quality_flags'), // auto-detected: 'empty_result', 'timeout', 'low_confidence', etc.

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_eval_turns_tenant_session').on(table.tenantId, table.sessionId),
    index('idx_eval_turns_tenant_created').on(table.tenantId, table.createdAt),
    index('idx_eval_turns_user_rating').on(table.tenantId, table.userRating),
    index('idx_eval_turns_admin_verdict').on(table.tenantId, table.adminVerdict),
    index('idx_eval_turns_quality_score').on(table.tenantId, table.qualityScore),
    index('idx_eval_turns_plan_hash').on(table.planHash),
    index('idx_eval_turns_sql_hash').on(table.sqlHash),
  ],
);

// ── Semantic Eval Examples ──────────────────────────────────────
// "Golden" examples curated from good interactions for few-shot prompting

export const semanticEvalExamples = pgTable(
  'semantic_eval_examples',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    // null = system-wide example visible to all tenants
    tenantId: text('tenant_id').references(() => tenants.id),
    sourceEvalTurnId: text('source_eval_turn_id').references(() => semanticEvalTurns.id),
    question: text('question').notNull(),
    plan: jsonb('plan').notNull(), // validated correct QueryPlan
    rationale: jsonb('rationale'), // correct PlanRationale
    category: text('category').notNull(), // 'sales' | 'golf' | 'inventory' | 'customer' | 'comparison' | 'trend' | 'anomaly'
    difficulty: text('difficulty').notNull(), // 'simple' | 'medium' | 'complex'
    qualityScore: numeric('quality_score', { precision: 3, scale: 2 }),
    isActive: boolean('is_active').notNull().default(true),
    addedBy: text('added_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_eval_examples_tenant_category').on(table.tenantId, table.category, table.isActive),
    index('idx_eval_examples_active').on(table.isActive, table.qualityScore),
  ],
);

// ── Semantic Eval Quality Daily ─────────────────────────────────
// Pre-aggregated daily quality metrics (read model pattern)

export const semanticEvalQualityDaily = pgTable(
  'semantic_eval_quality_daily',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    businessDate: date('business_date').notNull(),
    totalTurns: integer('total_turns').notNull().default(0),
    avgUserRating: numeric('avg_user_rating', { precision: 3, scale: 2 }),
    avgAdminScore: numeric('avg_admin_score', { precision: 3, scale: 2 }),
    avgConfidence: numeric('avg_confidence', { precision: 3, scale: 2 }),
    avgExecutionTimeMs: integer('avg_execution_time_ms'),
    clarificationRate: numeric('clarification_rate', { precision: 5, scale: 2 }),
    errorRate: numeric('error_rate', { precision: 5, scale: 2 }),
    hallucinationRate: numeric('hallucination_rate', { precision: 5, scale: 2 }),
    cacheHitRate: numeric('cache_hit_rate', { precision: 5, scale: 2 }),
    topFailureReasons: jsonb('top_failure_reasons'), // { reason: string, count: number }[]
    ratingDistribution: jsonb('rating_distribution'), // { "1": count, ..., "5": count }
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_eval_quality_daily_tenant_date').on(table.tenantId, table.businessDate),
  ],
);
