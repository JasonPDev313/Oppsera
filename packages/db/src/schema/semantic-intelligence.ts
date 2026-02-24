import { pgTable, text, boolean, timestamp, integer, jsonb, unique, date } from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';

// ── Semantic Intelligence Schema ───────────────────────────────────
// World-class AI features: pinned metrics, annotations, conversation
// branches, scheduled reports, and embeddable widget tokens.
// All tables are tenant-scoped with RLS (defense-in-depth).

// ── Pinned Metrics (user watchlist) ────────────────────────────────
// Users can pin metrics to their personal dashboard for quick access.
// Each pin stores display preferences and optional threshold alerts.

export const semanticPinnedMetrics = pgTable(
  'semantic_pinned_metrics',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    metricSlug: text('metric_slug').notNull(),
    displayName: text('display_name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    config: jsonb('config').$type<PinnedMetricConfig>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_pinned_metric_user').on(t.tenantId, t.userId, t.metricSlug)],
);

// ── Annotations on data points ─────────────────────────────────────
// Users can annotate specific data points on charts or reports.
// Annotations can be private or shared with the team.

export const semanticAnnotations = pgTable('semantic_annotations', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  metricSlug: text('metric_slug'),
  dimensionValue: text('dimension_value'),
  annotationDate: date('annotation_date'),
  text: text('text').notNull(),
  annotationType: text('annotation_type').notNull().default('note'),
  isShared: boolean('is_shared').notNull().default(false),
  metadata: jsonb('metadata').$type<AnnotationMetadata>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Conversation Branches (forked threads) ─────────────────────────
// Users can fork a conversation at any turn to explore alternative
// analysis paths without losing the original thread.

export const semanticConversationBranches = pgTable('semantic_conversation_branches', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  parentSessionId: text('parent_session_id').notNull(),
  parentTurnNumber: integer('parent_turn_number').notNull(),
  branchSessionId: text('branch_session_id').notNull(),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Scheduled Report Delivery Configs ──────────────────────────────
// Users can schedule recurring report deliveries (digest, snapshot,
// custom report) via in-app, email, or webhook channels.

export const semanticScheduledReports = pgTable('semantic_scheduled_reports', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  reportType: text('report_type').notNull().default('digest'),
  frequency: text('frequency').notNull().default('daily'),
  deliveryHour: integer('delivery_hour').notNull().default(8),
  deliveryDayOfWeek: integer('delivery_day_of_week'),
  deliveryDayOfMonth: integer('delivery_day_of_month'),
  recipientType: text('recipient_type').notNull().default('self'),
  recipientRoleIds: text('recipient_role_ids').array(),
  recipientUserIds: text('recipient_user_ids').array(),
  channel: text('channel').notNull().default('in_app'),
  webhookUrl: text('webhook_url'),
  config: jsonb('config').$type<ScheduledReportConfig>().default({}),
  isActive: boolean('is_active').notNull().default(true),
  lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
  nextDeliveryAt: timestamp('next_delivery_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Embeddable Widget Tokens ───────────────────────────────────────
// Secure tokens for embedding metric cards, charts, KPI grids,
// or chat widgets into external pages via iframe.

export const semanticEmbedTokens = pgTable('semantic_embed_tokens', {
  id: text('id').primaryKey().$defaultFn(generateUlid),
  tenantId: text('tenant_id').notNull(),
  createdBy: text('created_by').notNull(),
  token: text('token').notNull().unique(),
  widgetType: text('widget_type').notNull().default('metric_card'),
  config: jsonb('config').notNull().$type<EmbedWidgetConfig>().default({}),
  allowedOrigins: text('allowed_origins').array(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  viewCount: integer('view_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Type Helpers ───────────────────────────────────────────────────

export interface PinnedMetricConfig {
  showSparkline?: boolean;
  sparklineDays?: number;
  thresholdAlertAbove?: number;
  thresholdAlertBelow?: number;
  comparisonPeriod?: 'previous_period' | 'previous_year' | 'none';
  chartType?: 'sparkline' | 'bar' | 'number';
}

export type AnnotationType = 'note' | 'flag' | 'milestone' | 'alert';

export interface AnnotationMetadata {
  color?: string;
  icon?: string;
  chartContext?: Record<string, unknown>;
}

export type ReportType = 'digest' | 'custom_report' | 'metric_snapshot';
export type Frequency = 'daily' | 'weekly' | 'monthly';
export type RecipientType = 'self' | 'role' | 'custom';
export type DeliveryChannel = 'in_app' | 'email' | 'webhook';

export interface ScheduledReportConfig {
  lensSlug?: string;
  metricSlugs?: string[];
  dimensionSlugs?: string[];
  filters?: Record<string, unknown>;
  dateRange?: { start?: string; end?: string };
  format?: 'summary' | 'detailed' | 'csv';
}

export type WidgetType = 'metric_card' | 'chart' | 'kpi_grid' | 'chat';

export interface EmbedWidgetConfig {
  metricSlugs?: string[];
  chartType?: 'line' | 'bar' | 'pie' | 'table';
  dimensions?: string[];
  filters?: Record<string, unknown>;
  dateRange?: { start?: string; end?: string };
  theme?: 'light' | 'dark' | 'auto';
  refreshIntervalSeconds?: number;
}
