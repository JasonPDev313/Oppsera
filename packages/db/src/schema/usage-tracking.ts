import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';

// ── rm_usage_hourly ────────────────────────────────────────────
// Pre-aggregated API usage per tenant, per module, per hour.
// NO RLS — platform-level table accessed by admin only.
// Upserted by in-memory flush from the usage tracker.
export const rmUsageHourly = pgTable(
  'rm_usage_hourly',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    moduleKey: text('module_key').notNull(),
    hourBucket: timestamp('hour_bucket', { withTimezone: true }).notNull(),
    requestCount: integer('request_count').notNull().default(0),
    writeCount: integer('write_count').notNull().default(0),
    readCount: integer('read_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    uniqueUsers: integer('unique_users').notNull().default(0),
    totalDurationMs: integer('total_duration_ms').notNull().default(0),
    maxDurationMs: integer('max_duration_ms').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_usage_hourly_tenant_module_hour').on(
      table.tenantId,
      table.moduleKey,
      table.hourBucket,
    ),
    index('idx_rm_usage_hourly_hour').on(table.hourBucket),
    index('idx_rm_usage_hourly_tenant').on(table.tenantId, table.hourBucket),
    index('idx_rm_usage_hourly_module').on(table.moduleKey, table.hourBucket),
  ],
);

// ── rm_usage_daily ─────────────────────────────────────────────
// Rolled-up daily aggregates. Upserted directly by tracker flush.
export const rmUsageDaily = pgTable(
  'rm_usage_daily',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    moduleKey: text('module_key').notNull(),
    usageDate: date('usage_date').notNull(),
    requestCount: integer('request_count').notNull().default(0),
    writeCount: integer('write_count').notNull().default(0),
    readCount: integer('read_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    uniqueUsers: integer('unique_users').notNull().default(0),
    totalDurationMs: integer('total_duration_ms').notNull().default(0),
    maxDurationMs: integer('max_duration_ms').notNull().default(0),
    avgDurationMs: numeric('avg_duration_ms', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_usage_daily_tenant_module_date').on(
      table.tenantId,
      table.moduleKey,
      table.usageDate,
    ),
    index('idx_rm_usage_daily_date').on(table.usageDate),
    index('idx_rm_usage_daily_tenant').on(table.tenantId, table.usageDate),
    index('idx_rm_usage_daily_module').on(table.moduleKey, table.usageDate),
  ],
);

// ── rm_usage_workflow_daily ────────────────────────────────────
// Per-tenant, per-workflow (permission string) daily counts.
// Enables drill-down into sub-module workflows.
export const rmUsageWorkflowDaily = pgTable(
  'rm_usage_workflow_daily',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    moduleKey: text('module_key').notNull(),
    workflowKey: text('workflow_key').notNull(),
    usageDate: date('usage_date').notNull(),
    requestCount: integer('request_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    uniqueUsers: integer('unique_users').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_usage_workflow_daily').on(
      table.tenantId,
      table.moduleKey,
      table.workflowKey,
      table.usageDate,
    ),
    index('idx_rm_usage_workflow_module_date').on(table.moduleKey, table.usageDate),
  ],
);

// ── rm_usage_module_adoption ───────────────────────────────────
// Per-tenant, per-module adoption lifecycle. Tracks first/last use,
// active days, and unique user count.
export const rmUsageModuleAdoption = pgTable(
  'rm_usage_module_adoption',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    moduleKey: text('module_key').notNull(),
    firstUsedAt: timestamp('first_used_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull(),
    totalRequests: integer('total_requests').notNull().default(0),
    totalUniqueUsers: integer('total_unique_users').notNull().default(0),
    activeDays: integer('active_days').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_usage_adoption_tenant_module').on(
      table.tenantId,
      table.moduleKey,
    ),
    index('idx_rm_usage_adoption_module').on(table.moduleKey),
    index('idx_rm_usage_adoption_active').on(table.isActive),
  ],
);

// ── usage_action_items ─────────────────────────────────────────
// Auto-generated actionable insights. Admin can review/dismiss/action.
export const usageActionItems = pgTable(
  'usage_action_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    category: text('category').notNull(),
    severity: text('severity').notNull().default('info'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    tenantId: text('tenant_id'),
    moduleKey: text('module_key'),
    metadata: jsonb('metadata').notNull().default('{}'),
    status: text('status').notNull().default('open'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_action_items_status').on(table.status, table.severity),
    index('idx_action_items_category').on(table.category, table.status),
    index('idx_action_items_tenant').on(table.tenantId),
  ],
);
