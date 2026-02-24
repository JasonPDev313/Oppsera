import {
  pgTable,
  text,
  boolean,
  integer,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── ERP Workflow Configs ────────────────────────────────────────
// Per-tenant, per-module workflow behaviour overrides.
// When no row exists, the system falls back to TIER_WORKFLOW_DEFAULTS.
export const erpWorkflowConfigs = pgTable(
  'erp_workflow_configs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    moduleKey: text('module_key').notNull(),
    workflowKey: text('workflow_key').notNull(),
    autoMode: boolean('auto_mode').notNull().default(true),
    approvalRequired: boolean('approval_required').notNull().default(false),
    userVisible: boolean('user_visible').notNull().default(false),
    customSettings: jsonb('custom_settings').default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_erp_workflow_configs').on(
      table.tenantId,
      table.moduleKey,
      table.workflowKey,
    ),
    index('idx_erp_workflow_configs_tenant').on(table.tenantId),
    index('idx_erp_workflow_configs_module').on(table.tenantId, table.moduleKey),
  ],
);

// ── ERP Workflow Config Change Log (append-only) ────────────────
export const erpWorkflowConfigChangeLog = pgTable(
  'erp_workflow_config_change_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    moduleKey: text('module_key').notNull(),
    workflowKey: text('workflow_key').notNull(),
    changedBy: text('changed_by').notNull(),
    changeType: text('change_type').notNull(), // 'tier_change' | 'manual_override' | 'auto_classification'
    oldConfig: jsonb('old_config'),
    newConfig: jsonb('new_config'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_erp_workflow_change_log_tenant').on(table.tenantId, table.createdAt),
  ],
);

// ── Close Orchestrator Runs ────────────────────────────────────
export const erpCloseOrchestratorRuns = pgTable(
  'erp_close_orchestrator_runs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    businessDate: date('business_date').notNull(),
    locationId: text('location_id'),
    status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'failed' | 'partial'
    totalSteps: integer('total_steps').notNull().default(0),
    completedSteps: integer('completed_steps').notNull().default(0),
    skippedSteps: integer('skipped_steps').notNull().default(0),
    failedSteps: integer('failed_steps').notNull().default(0),
    stepResults: jsonb('step_results').notNull().default('[]'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    triggeredBy: text('triggered_by').notNull(), // 'auto' | 'manual' | userId
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_close_orchestrator_runs_tenant').on(table.tenantId, table.createdAt),
  ],
);
