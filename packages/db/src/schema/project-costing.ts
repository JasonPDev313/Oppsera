import {
  pgTable,
  text,
  timestamp,
  numeric,
  integer,
  index,
  uniqueIndex,
  jsonb,
  date,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { glAccounts } from './accounting';

// ── projects ────────────────────────────────────────────────────
export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id'),
    projectNumber: text('project_number').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('active'),
    projectType: text('project_type'),
    customerId: text('customer_id'),
    managerUserId: text('manager_user_id'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    completionDate: date('completion_date'),
    budgetAmount: numeric('budget_amount', { precision: 12, scale: 2 }),
    budgetLaborHours: numeric('budget_labor_hours', { precision: 10, scale: 2 }),
    notes: text('notes'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: text('archived_by'),
    archivedReason: text('archived_reason'),
    clientRequestId: text('client_request_id'),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    uniqueIndex('uq_projects_tenant_number').on(table.tenantId, table.projectNumber),
    index('idx_projects_tenant_status').on(table.tenantId, table.status),
    index('idx_projects_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_projects_tenant_location').on(table.tenantId, table.locationId),
  ],
);

// ── project_tasks ───────────────────────────────────────────────
export const projectTasks = pgTable(
  'project_tasks',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    taskNumber: text('task_number').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('open'),
    budgetAmount: numeric('budget_amount', { precision: 12, scale: 2 }),
    budgetHours: numeric('budget_hours', { precision: 10, scale: 2 }),
    glExpenseAccountId: text('gl_expense_account_id').references(() => glAccounts.id),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_project_tasks_project_number').on(
      table.tenantId,
      table.projectId,
      table.taskNumber,
    ),
    index('idx_project_tasks_project').on(table.projectId),
    index('idx_project_tasks_gl_account').on(table.glExpenseAccountId),
  ],
);

// ── rm_project_cost_summary (CQRS read model) ──────────────────
export const rmProjectCostSummary = pgTable(
  'rm_project_cost_summary',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    fiscalPeriod: text('fiscal_period').notNull(),
    revenueAmount: numeric('revenue_amount', { precision: 19, scale: 4 }).notNull().default('0'),
    directCostAmount: numeric('direct_cost_amount', { precision: 19, scale: 4 })
      .notNull()
      .default('0'),
    laborHours: numeric('labor_hours', { precision: 10, scale: 2 }).notNull().default('0'),
    laborCost: numeric('labor_cost', { precision: 19, scale: 4 }).notNull().default('0'),
    materialCost: numeric('material_cost', { precision: 19, scale: 4 }).notNull().default('0'),
    otherCost: numeric('other_cost', { precision: 19, scale: 4 }).notNull().default('0'),
    grossMargin: numeric('gross_margin', { precision: 19, scale: 4 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_project_cost_summary').on(
      table.tenantId,
      table.projectId,
      table.fiscalPeriod,
    ),
    index('idx_rm_project_cost_project').on(table.projectId),
    index('idx_rm_project_cost_tenant').on(table.tenantId),
  ],
);
