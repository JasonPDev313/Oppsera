import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { customers } from './customers';

// ── Tags — Tag definitions (manual + smart) ─────────────────────────────────
export const tags = pgTable(
  'tags',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#6366f1'),
    icon: text('icon'),
    tagType: text('tag_type').notNull().default('manual'),
    category: text('category'),
    isActive: boolean('is_active').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    customerCount: integer('customer_count').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: text('archived_by'),
    archivedReason: text('archived_reason'),
  },
  (table) => [
    uniqueIndex('uq_tags_tenant_slug')
      .on(table.tenantId, table.slug)
      .where(sql`archived_at IS NULL`),
    index('idx_tags_tenant_type_active').on(table.tenantId, table.tagType, table.isActive),
    index('idx_tags_tenant_category').on(table.tenantId, table.category),
  ],
);

// ── Customer Tags — Customer-to-tag assignments with evidence ───────────────
export const customerTags = pgTable(
  'customer_tags',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id),
    source: text('source').notNull().default('manual'),
    sourceRuleId: text('source_rule_id'),
    evidence: jsonb('evidence').$type<SmartTagEvidence | null>(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    appliedBy: text('applied_by').notNull(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: text('removed_by'),
    removedReason: text('removed_reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    evaluationSnapshot: jsonb('evaluation_snapshot').$type<Record<string, unknown> | null>(),
  },
  (table) => [
    uniqueIndex('uq_customer_tags_tenant_customer_tag_active')
      .on(table.tenantId, table.customerId, table.tagId)
      .where(sql`removed_at IS NULL`),
    index('idx_customer_tags_tenant_tag').on(table.tenantId, table.tagId),
    index('idx_customer_tags_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_customer_tags_tenant_source_rule').on(table.tenantId, table.sourceRuleId),
    index('idx_customer_tags_tenant_expires').on(table.tenantId, table.expiresAt),
  ],
);

// ── Smart Tag Rules — Rule definitions with conditions JSONB ────────────────
export const smartTagRules = pgTable(
  'smart_tag_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(false),
    evaluationMode: text('evaluation_mode').notNull().default('scheduled'),
    scheduleCron: text('schedule_cron'),
    conditions: jsonb('conditions').notNull().$type<SmartTagConditionGroup[]>(),
    autoRemove: boolean('auto_remove').notNull().default(true),
    cooldownHours: integer('cooldown_hours'),
    priority: integer('priority').notNull().default(100),
    version: integer('version').notNull().default(1),
    lastEvaluatedAt: timestamp('last_evaluated_at', { withTimezone: true }),
    lastEvaluationDurationMs: integer('last_evaluation_duration_ms'),
    customersMatched: integer('customers_matched').notNull().default(0),
    customersAdded: integer('customers_added').notNull().default(0),
    customersRemoved: integer('customers_removed').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    uniqueIndex('uq_smart_tag_rules_tenant_tag').on(table.tenantId, table.tagId),
    index('idx_smart_tag_rules_tenant_active').on(table.tenantId, table.isActive),
    index('idx_smart_tag_rules_tenant_eval_mode').on(table.tenantId, table.evaluationMode),
  ],
);

// ── Smart Tag Evaluations — Evaluation run history (append-only) ────────────
export const smartTagEvaluations = pgTable(
  'smart_tag_evaluations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ruleId: text('rule_id')
      .notNull()
      .references(() => smartTagRules.id),
    triggerType: text('trigger_type').notNull(),
    triggerEventId: text('trigger_event_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    status: text('status').notNull().default('running'),
    customersEvaluated: integer('customers_evaluated').notNull().default(0),
    tagsApplied: integer('tags_applied').notNull().default(0),
    tagsRemoved: integer('tags_removed').notNull().default(0),
    tagsUnchanged: integer('tags_unchanged').notNull().default(0),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('idx_smart_tag_evaluations_tenant_rule_started').on(
      table.tenantId,
      table.ruleId,
      table.startedAt,
    ),
    index('idx_smart_tag_evaluations_tenant_status').on(table.tenantId, table.status),
  ],
);

// ── Tag Audit Log — Append-only audit trail ─────────────────────────────────
export const tagAuditLog = pgTable(
  'tag_audit_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    tagId: text('tag_id').notNull(),
    action: text('action').notNull(),
    source: text('source').notNull(),
    sourceRuleId: text('source_rule_id'),
    actorId: text('actor_id').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown> | null>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tag_audit_log_tenant_customer_occurred').on(
      table.tenantId,
      table.customerId,
      table.occurredAt,
    ),
    index('idx_tag_audit_log_tenant_tag_occurred').on(
      table.tenantId,
      table.tagId,
      table.occurredAt,
    ),
    index('idx_tag_audit_log_tenant_action_occurred').on(
      table.tenantId,
      table.action,
      table.occurredAt,
    ),
  ],
);

// ── JSONB Types ─────────────────────────────────────────────────────────────

export type ConditionOperator =
  | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'
  | 'between' | 'in' | 'not_in' | 'contains'
  | 'is_null' | 'is_not_null';

export interface SmartTagCondition {
  metric: string;
  operator: ConditionOperator;
  value: number | string | boolean | string[] | [number, number];
  unit?: string;
}

export interface SmartTagConditionGroup {
  conditions: SmartTagCondition[];
}

export interface SmartTagEvidence {
  ruleId: string;
  ruleName: string;
  evaluatedAt: string;
  conditions: Array<{
    metric: string;
    operator: string;
    threshold: unknown;
    actualValue: unknown;
    passed: boolean;
  }>;
}
