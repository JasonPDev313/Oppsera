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
import { semanticEvalTurns, semanticEvalExamples } from './evaluation';

// ── Semantic Training Pairs (RAG) ──────────────────────────────
// Stores validated question→SQL/plan pairs for similarity-based retrieval.
// Uses pg_trgm GIN index on `question` for fuzzy matching (index in migration).

export const semanticTrainingPairs = pgTable(
  'semantic_training_pairs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').references(() => tenants.id),
    question: text('question').notNull(),
    compiledSql: text('compiled_sql'),
    plan: jsonb('plan'),
    mode: text('mode').notNull().default('metrics'), // 'metrics' | 'sql'
    qualityScore: numeric('quality_score', { precision: 3, scale: 2 }),
    source: text('source').notNull().default('auto'), // 'auto' | 'admin' | 'thumbs_up'
    sourceEvalTurnId: text('source_eval_turn_id').references(() => semanticEvalTurns.id),
    isActive: boolean('is_active').notNull().default(true),
    usageCount: integer('usage_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_training_pairs_tenant_active').on(table.tenantId, table.isActive),
    index('idx_training_pairs_source_turn').on(table.sourceEvalTurnId),
  ],
);

// ── A/B Experiments ──────────────────────────────────────────────

export const semanticEvalExperiments = pgTable(
  'semantic_eval_experiments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('draft'), // draft | running | completed | canceled
    hypothesis: text('hypothesis'),
    // Control variant
    controlName: text('control_name').notNull().default('Control'),
    controlSystemPrompt: text('control_system_prompt'),
    controlModel: text('control_model'),
    controlTemperature: numeric('control_temperature', { precision: 3, scale: 2 }),
    // Treatment variant
    treatmentName: text('treatment_name').notNull().default('Treatment'),
    treatmentSystemPrompt: text('treatment_system_prompt'),
    treatmentModel: text('treatment_model'),
    treatmentTemperature: numeric('treatment_temperature', { precision: 3, scale: 2 }),
    // Configuration
    trafficSplitPct: integer('traffic_split_pct').notNull().default(50),
    targetSampleSize: integer('target_sample_size').default(100),
    tenantId: text('tenant_id'),
    // Results
    controlTurns: integer('control_turns').notNull().default(0),
    treatmentTurns: integer('treatment_turns').notNull().default(0),
    controlAvgRating: numeric('control_avg_rating', { precision: 3, scale: 2 }),
    treatmentAvgRating: numeric('treatment_avg_rating', { precision: 3, scale: 2 }),
    controlAvgQuality: numeric('control_avg_quality', { precision: 3, scale: 2 }),
    treatmentAvgQuality: numeric('treatment_avg_quality', { precision: 3, scale: 2 }),
    controlAvgLatencyMs: integer('control_avg_latency_ms'),
    treatmentAvgLatencyMs: integer('treatment_avg_latency_ms'),
    controlTotalCostUsd: numeric('control_total_cost_usd', { precision: 10, scale: 4 }).default('0'),
    treatmentTotalCostUsd: numeric('treatment_total_cost_usd', { precision: 10, scale: 4 }).default('0'),
    winner: text('winner'), // control | treatment | inconclusive | null
    conclusionNotes: text('conclusion_notes'),
    // Metadata
    createdBy: text('created_by'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_eval_experiments_status').on(table.status),
    index('idx_eval_experiments_tenant').on(table.tenantId),
  ],
);

// ── Regression Test Runs ─────────────────────────────────────────

export const semanticEvalRegressionRuns = pgTable(
  'semantic_eval_regression_runs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    name: text('name'),
    status: text('status').notNull().default('pending'), // pending | running | completed | failed
    triggerType: text('trigger_type').notNull().default('manual'), // manual | scheduled | pre_deploy
    exampleCount: integer('example_count').notNull().default(0),
    categoryFilter: text('category_filter'),
    // Results
    totalExamples: integer('total_examples').notNull().default(0),
    passed: integer('passed').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    errored: integer('errored').notNull().default(0),
    passRate: numeric('pass_rate', { precision: 5, scale: 2 }),
    avgLatencyMs: integer('avg_latency_ms'),
    totalCostUsd: numeric('total_cost_usd', { precision: 10, scale: 4 }).default('0'),
    // Config snapshot
    modelConfig: jsonb('model_config'),
    promptSnapshot: text('prompt_snapshot'),
    // Metadata
    createdBy: text('created_by'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_eval_regression_status').on(table.status),
    index('idx_eval_regression_created').on(table.createdAt),
  ],
);

// ── Regression Test Results ──────────────────────────────────────

export const semanticEvalRegressionResults = pgTable(
  'semantic_eval_regression_results',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    runId: text('run_id')
      .notNull()
      .references(() => semanticEvalRegressionRuns.id, { onDelete: 'cascade' }),
    exampleId: text('example_id')
      .notNull()
      .references(() => semanticEvalExamples.id),
    status: text('status').notNull(), // passed | failed | errored
    expectedPlan: jsonb('expected_plan'),
    actualPlan: jsonb('actual_plan'),
    planMatch: boolean('plan_match'),
    expectedSql: text('expected_sql'),
    actualSql: text('actual_sql'),
    sqlMatch: boolean('sql_match'),
    executionTimeMs: integer('execution_time_ms'),
    rowCount: integer('row_count'),
    executionError: text('execution_error'),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
    diffSummary: text('diff_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_eval_regression_results_run').on(table.runId),
    index('idx_eval_regression_results_status').on(table.runId, table.status),
  ],
);

// ── Safety Rules ─────────────────────────────────────────────────

export const semanticEvalSafetyRules = pgTable(
  'semantic_eval_safety_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    name: text('name').notNull(),
    description: text('description'),
    ruleType: text('rule_type').notNull(), // pii_detection | injection_detection | table_access | row_limit | custom_regex
    isActive: boolean('is_active').notNull().default(true),
    severity: text('severity').notNull().default('warning'), // info | warning | critical
    config: jsonb('config').notNull().default({}),
    triggerCount: integer('trigger_count').notNull().default(0),
    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_eval_safety_rules_active').on(table.isActive, table.ruleType),
  ],
);

// ── Safety Violations ────────────────────────────────────────────

export const semanticEvalSafetyViolations = pgTable(
  'semantic_eval_safety_violations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    ruleId: text('rule_id')
      .notNull()
      .references(() => semanticEvalSafetyRules.id),
    evalTurnId: text('eval_turn_id').references(() => semanticEvalTurns.id),
    tenantId: text('tenant_id'),
    severity: text('severity').notNull(),
    ruleType: text('rule_type').notNull(),
    details: jsonb('details'),
    resolved: boolean('resolved').notNull().default(false),
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_eval_safety_violations_rule').on(table.ruleId),
    index('idx_eval_safety_violations_turn').on(table.evalTurnId),
  ],
);

// ── Cost Tracking Daily ──────────────────────────────────────────

export const semanticEvalCostDaily = pgTable(
  'semantic_eval_cost_daily',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id'),
    businessDate: date('business_date').notNull(),
    totalTurns: integer('total_turns').notNull().default(0),
    totalTokensInput: integer('total_tokens_input').notNull().default(0),
    totalTokensOutput: integer('total_tokens_output').notNull().default(0),
    totalCostUsd: numeric('total_cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
    avgCostPerQuery: numeric('avg_cost_per_query', { precision: 10, scale: 6 }),
    modelBreakdown: jsonb('model_breakdown'),
    lensBreakdown: jsonb('lens_breakdown'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_eval_cost_daily_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── Review Assignments ───────────────────────────────────────────

export const semanticEvalReviewAssignments = pgTable(
  'semantic_eval_review_assignments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    evalTurnId: text('eval_turn_id')
      .notNull()
      .references(() => semanticEvalTurns.id),
    assignedTo: text('assigned_to').notNull(),
    assignedBy: text('assigned_by'),
    priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
    status: text('status').notNull().default('pending'), // pending | in_progress | completed | skipped
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_eval_review_assignments_assignee').on(table.assignedTo, table.status),
    index('idx_eval_review_assignments_turn').on(table.evalTurnId),
  ],
);
