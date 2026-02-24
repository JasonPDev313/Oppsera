import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  numeric,
  date,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { semanticEvalTurns } from './evaluation';

// ── Metric Goals (Pacing / Goal Tracking) ───────────────────────────

export const semanticMetricGoals = pgTable(
  'semantic_metric_goals',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    metricSlug: text('metric_slug').notNull(),
    targetValue: numeric('target_value', { precision: 19, scale: 4 }).notNull(),
    periodType: text('period_type').notNull().default('monthly'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    locationId: text('location_id'),
    createdBy: text('created_by'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_metric_goals_tenant_active').on(table.tenantId, table.isActive, table.periodType),
    index('idx_metric_goals_tenant_metric').on(table.tenantId, table.metricSlug, table.isActive),
  ],
);

// ── Alert Rules (NL-configured + system-generated) ──────────────────

export const semanticAlertRules = pgTable(
  'semantic_alert_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    ruleType: text('rule_type').notNull().default('threshold'),
    metricSlug: text('metric_slug'),
    thresholdOperator: text('threshold_operator'),
    thresholdValue: numeric('threshold_value', { precision: 19, scale: 4 }),
    sensitivity: text('sensitivity').default('medium'),
    baselineWindowDays: integer('baseline_window_days').default(30),
    deliveryChannels: jsonb('delivery_channels').$type<string[]>().notNull().default(['in_app']),
    schedule: text('schedule').default('realtime'),
    locationId: text('location_id'),
    dimensionFilters: jsonb('dimension_filters'),
    originalNlQuery: text('original_nl_query'),
    isActive: boolean('is_active').notNull().default(true),
    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
    triggerCount: integer('trigger_count').notNull().default(0),
    cooldownMinutes: integer('cooldown_minutes').notNull().default(60),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_alert_rules_tenant_active').on(table.tenantId, table.isActive, table.ruleType),
  ],
);

// ── Alert Notifications (triggered alerts) ──────────────────────────

export const semanticAlertNotifications = pgTable(
  'semantic_alert_notifications',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    alertRuleId: text('alert_rule_id').notNull().references(() => semanticAlertRules.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    severity: text('severity').notNull().default('info'),
    metricSlug: text('metric_slug'),
    metricValue: numeric('metric_value', { precision: 19, scale: 4 }),
    baselineValue: numeric('baseline_value', { precision: 19, scale: 4 }),
    deviationPct: numeric('deviation_pct', { precision: 8, scale: 2 }),
    businessDate: date('business_date'),
    locationId: text('location_id'),
    channelsSent: jsonb('channels_sent').$type<string[]>().default([]),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    isDismissed: boolean('is_dismissed').notNull().default(false),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    actionTaken: text('action_taken'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_alert_notifications_tenant_unread').on(table.tenantId, table.isRead, table.createdAt),
    index('idx_alert_notifications_rule').on(table.alertRuleId, table.createdAt),
  ],
);

// ── Scheduled Insight Digests ────────────────────────────────────────

export const semanticInsightDigests = pgTable(
  'semantic_insight_digests',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    digestType: text('digest_type').notNull().default('daily'),
    scheduleDay: integer('schedule_day'),
    scheduleHour: integer('schedule_hour').notNull().default(8),
    targetRole: text('target_role'),
    targetUserId: text('target_user_id'),
    metricSlugs: jsonb('metric_slugs').$type<string[]>(),
    locationId: text('location_id'),
    lastGeneratedAt: timestamp('last_generated_at', { withTimezone: true }),
    lastNarrative: text('last_narrative'),
    lastSections: jsonb('last_sections'),
    lastKpis: jsonb('last_kpis'),
    deliveryChannels: jsonb('delivery_channels').$type<string[]>().notNull().default(['in_app']),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_insight_digests_tenant_active').on(table.tenantId, table.isActive, table.digestType),
  ],
);

// ── Shared Insights (shareable links) ────────────────────────────────

export const semanticSharedInsights = pgTable(
  'semantic_shared_insights',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    evalTurnId: text('eval_turn_id').references(() => semanticEvalTurns.id),
    sessionId: text('session_id'),
    title: text('title'),
    userMessage: text('user_message').notNull(),
    narrative: text('narrative').notNull(),
    sections: jsonb('sections'),
    queryResult: jsonb('query_result'),
    chartConfig: jsonb('chart_config'),
    mode: text('mode'),
    shareToken: text('share_token').notNull().unique(),
    accessLevel: text('access_level').notNull().default('tenant'),
    allowedUserIds: jsonb('allowed_user_ids').$type<string[]>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    viewCount: integer('view_count').notNull().default(0),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_shared_insights_tenant').on(table.tenantId, table.createdAt),
  ],
);

// ── User AI Preferences (cross-session memory) ──────────────────────

export const semanticUserPreferences = pgTable(
  'semantic_user_preferences',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    userId: text('user_id').notNull(),
    preferredMetrics: jsonb('preferred_metrics').$type<Record<string, number>>(),
    preferredDimensions: jsonb('preferred_dimensions').$type<Record<string, number>>(),
    preferredGranularity: text('preferred_granularity'),
    preferredLocationId: text('preferred_location_id'),
    defaultDateRange: text('default_date_range'),
    frequentQuestions: jsonb('frequent_questions').$type<Array<{ question: string; count: number; lastAsked: string }>>(),
    topicInterests: jsonb('topic_interests').$type<Record<string, number>>(),
    lastSessionContext: jsonb('last_session_context'),
    preferredChartType: text('preferred_chart_type'),
    showDebugPanel: boolean('show_debug_panel').default(false),
    autoExpandTables: boolean('auto_expand_tables').default(true),
    insightFeedRole: text('insight_feed_role'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_user_prefs_tenant_user').on(table.tenantId, table.userId),
  ],
);

// ── Background Analysis Findings (agentic overnight scan) ────────────

export const semanticAnalysisFindings = pgTable(
  'semantic_analysis_findings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    findingType: text('finding_type').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    detailedNarrative: text('detailed_narrative'),
    metricSlugs: jsonb('metric_slugs').$type<string[]>(),
    dimensionValues: jsonb('dimension_values'),
    businessDateStart: date('business_date_start'),
    businessDateEnd: date('business_date_end'),
    confidence: numeric('confidence', { precision: 3, scale: 2 }),
    significanceScore: numeric('significance_score', { precision: 5, scale: 2 }),
    baselineValue: numeric('baseline_value', { precision: 19, scale: 4 }),
    observedValue: numeric('observed_value', { precision: 19, scale: 4 }),
    changePct: numeric('change_pct', { precision: 8, scale: 2 }),
    chartType: text('chart_type'),
    chartData: jsonb('chart_data'),
    priority: text('priority').notNull().default('medium'),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    isDismissed: boolean('is_dismissed').notNull().default(false),
    isActionable: boolean('is_actionable').notNull().default(true),
    suggestedActions: jsonb('suggested_actions').$type<string[]>(),
    analysisRunId: text('analysis_run_id'),
    analysisDurationMs: integer('analysis_duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_analysis_findings_tenant_unread').on(table.tenantId, table.isRead, table.priority, table.createdAt),
    index('idx_analysis_findings_tenant_type').on(table.tenantId, table.findingType, table.createdAt),
    index('idx_analysis_findings_run').on(table.analysisRunId),
  ],
);

// ── What-If Simulations ──────────────────────────────────────────────

export interface SimulationScenario {
  name: string;
  adjustments: Array<{
    variable: string;
    changeType: 'absolute' | 'percentage';
    changeValue: number;
  }>;
  projectedValue: number | null;
  narrative: string | null;
}

export const semanticSimulations = pgTable(
  'semantic_simulations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    title: text('title').notNull(),
    description: text('description'),
    simulationType: text('simulation_type').notNull(),
    baseMetricSlug: text('base_metric_slug').notNull(),
    baseValue: numeric('base_value', { precision: 19, scale: 4 }).notNull(),
    scenarios: jsonb('scenarios').$type<SimulationScenario[]>().notNull(),
    bestScenario: text('best_scenario'),
    resultNarrative: text('result_narrative'),
    resultSections: jsonb('result_sections'),
    createdBy: text('created_by').notNull(),
    isSaved: boolean('is_saved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_simulations_tenant').on(table.tenantId, table.createdAt),
  ],
);
