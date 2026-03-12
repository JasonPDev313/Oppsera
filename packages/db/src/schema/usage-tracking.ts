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
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

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

// ── attrition_risk_scores ────────────────────────────────────
// Computed attrition risk per tenant with signal breakdown and narrative.
// NO RLS — platform-level table accessed by admin only.
export const attritionRiskScores = pgTable(
  'attrition_risk_scores',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    overallScore: integer('overall_score').notNull().default(0),
    riskLevel: text('risk_level').notNull().default('low'),
    // Individual signal scores (0-100)
    loginDeclineScore: integer('login_decline_score').notNull().default(0),
    usageDeclineScore: integer('usage_decline_score').notNull().default(0),
    moduleAbandonmentScore: integer('module_abandonment_score').notNull().default(0),
    userShrinkageScore: integer('user_shrinkage_score').notNull().default(0),
    errorFrustrationScore: integer('error_frustration_score').notNull().default(0),
    breadthNarrowingScore: integer('breadth_narrowing_score').notNull().default(0),
    stalenessScore: integer('staleness_score').notNull().default(0),
    onboardingStallScore: integer('onboarding_stall_score').notNull().default(0),
    // Context
    signalDetails: jsonb('signal_details').notNull().default('{}'),
    narrative: text('narrative').notNull().default(''),
    // Tenant snapshot (denormalized for read-model performance)
    tenantName: text('tenant_name').notNull().default(''),
    tenantStatus: text('tenant_status').notNull().default(''),
    industry: text('industry'),
    healthGrade: text('health_grade'),
    totalLocations: integer('total_locations').notNull().default(0),
    totalUsers: integer('total_users').notNull().default(0),
    activeModules: integer('active_modules').notNull().default(0),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    // Lifecycle
    scoredAt: timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by'),
    reviewNotes: text('review_notes'),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_attrition_tenant').on(table.tenantId, table.scoredAt),
    index('idx_attrition_risk_level').on(table.riskLevel, table.overallScore),
    index('idx_attrition_status').on(table.status, table.riskLevel),
    index('idx_attrition_scored_at').on(table.scoredAt),
    // Compound cursor for stable pagination — Drizzle index() does not support DESC modifiers;
    // the actual index is (overall_score DESC, scored_at DESC, id DESC) per migration 0307.
    index('idx_attrition_cursor').on(table.overallScore, table.scoredAt, table.id),
    // Domain constraints
    check('chk_attrition_risk_level', sql`risk_level IN ('low', 'medium', 'high', 'critical')`),
    check('chk_attrition_status', sql`status IN ('open', 'reviewed', 'actioned', 'dismissed', 'superseded')`),
    check('chk_attrition_health_grade', sql`health_grade IS NULL OR health_grade IN ('A', 'B', 'C', 'D', 'F')`),
    check('chk_attrition_overall_score', sql`overall_score BETWEEN 0 AND 100`),
    check('chk_attrition_login_decline', sql`login_decline_score BETWEEN 0 AND 100`),
    check('chk_attrition_usage_decline', sql`usage_decline_score BETWEEN 0 AND 100`),
    check('chk_attrition_module_abandon', sql`module_abandonment_score BETWEEN 0 AND 100`),
    check('chk_attrition_user_shrinkage', sql`user_shrinkage_score BETWEEN 0 AND 100`),
    check('chk_attrition_error_frustration', sql`error_frustration_score BETWEEN 0 AND 100`),
    check('chk_attrition_breadth_narrow', sql`breadth_narrowing_score BETWEEN 0 AND 100`),
    check('chk_attrition_staleness', sql`staleness_score BETWEEN 0 AND 100`),
    check('chk_attrition_onboard_stall', sql`onboarding_stall_score BETWEEN 0 AND 100`),
    check('chk_attrition_locations', sql`total_locations >= 0`),
    check('chk_attrition_users', sql`total_users >= 0`),
    check('chk_attrition_modules', sql`active_modules >= 0`),
  ],
);
