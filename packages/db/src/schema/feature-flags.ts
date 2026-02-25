import { pgTable, text, boolean, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from './core';

// ── Feature Flag Definitions (system-wide) ──────────────────

export const featureFlagDefinitions = pgTable('feature_flag_definitions', {
  id: text('id').primaryKey().notNull().$defaultFn(() => 'gen_ulid()'),
  flagKey: text('flag_key').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  moduleKey: text('module_key'),
  riskLevel: text('risk_level').notNull().default('low'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Tenant Feature Flags (per-tenant) ───────────────────────

export const tenantFeatureFlags = pgTable('tenant_feature_flags', {
  id: text('id').primaryKey().notNull().$defaultFn(() => 'gen_ulid()'),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  flagKey: text('flag_key').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(false),
  description: text('description'),
  enabledAt: timestamp('enabled_at', { withTimezone: true }),
  enabledBy: text('enabled_by'),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  disabledBy: text('disabled_by'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('tenant_feature_flags_unique').on(table.tenantId, table.flagKey),
  index('idx_tenant_feature_flags_tenant').on(table.tenantId),
  index('idx_tenant_feature_flags_key').on(table.flagKey, table.isEnabled),
]);

// ── Dead Letter Retry Log ───────────────────────────────────

export const deadLetterRetryLog = pgTable('dead_letter_retry_log', {
  id: text('id').primaryKey().notNull().$defaultFn(() => 'gen_ulid()'),
  deadLetterId: text('dead_letter_id').notNull(),
  retryNumber: text('retry_number').notNull(),
  retriedBy: text('retried_by').notNull(),
  retryResult: text('retry_result').notNull(),
  errorMessage: text('error_message'),
  retriedAt: timestamp('retried_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_dead_letter_retry_log_dl').on(table.deadLetterId),
]);
