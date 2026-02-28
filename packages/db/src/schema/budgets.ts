import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';
import { glAccounts } from './accounting';

// ── budgets ──────────────────────────────────────────────────────
export const budgets = pgTable(
  'budgets',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    fiscalYear: integer('fiscal_year').notNull(),
    status: text('status').notNull().default('draft'), // draft, approved, locked
    description: text('description'),
    locationId: text('location_id').references(() => locations.id),
    createdBy: text('created_by'),
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_budgets_tenant_name_year').on(table.tenantId, table.name, table.fiscalYear),
    index('idx_budgets_tenant_year').on(table.tenantId, table.fiscalYear),
    index('idx_budgets_tenant_status').on(table.tenantId, table.status),
  ],
);

// ── budget_lines ─────────────────────────────────────────────────
export const budgetLines = pgTable(
  'budget_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    budgetId: text('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    glAccountId: text('gl_account_id')
      .notNull()
      .references(() => glAccounts.id),
    month1: numeric('month_1', { precision: 12, scale: 2 }).notNull().default('0'),
    month2: numeric('month_2', { precision: 12, scale: 2 }).notNull().default('0'),
    month3: numeric('month_3', { precision: 12, scale: 2 }).notNull().default('0'),
    month4: numeric('month_4', { precision: 12, scale: 2 }).notNull().default('0'),
    month5: numeric('month_5', { precision: 12, scale: 2 }).notNull().default('0'),
    month6: numeric('month_6', { precision: 12, scale: 2 }).notNull().default('0'),
    month7: numeric('month_7', { precision: 12, scale: 2 }).notNull().default('0'),
    month8: numeric('month_8', { precision: 12, scale: 2 }).notNull().default('0'),
    month9: numeric('month_9', { precision: 12, scale: 2 }).notNull().default('0'),
    month10: numeric('month_10', { precision: 12, scale: 2 }).notNull().default('0'),
    month11: numeric('month_11', { precision: 12, scale: 2 }).notNull().default('0'),
    month12: numeric('month_12', { precision: 12, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_budget_lines_budget_account').on(table.budgetId, table.glAccountId),
    index('idx_budget_lines_budget').on(table.budgetId),
    index('idx_budget_lines_account').on(table.glAccountId),
    index('idx_budget_lines_tenant').on(table.tenantId),
  ],
);
