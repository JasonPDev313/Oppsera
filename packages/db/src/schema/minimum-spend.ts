import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Minimum Spend Rules ─────────────────────────────────────────

export const minimumSpendRules = pgTable(
  'minimum_spend_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    title: text('title').notNull(),
    membershipPlanId: text('membership_plan_id'),
    amountCents: integer('amount_cents').notNull(),
    frequencyId: text('frequency_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_minimum_spend_rules_tenant').on(table.tenantId)],
);

// ── Minimum Spend Rule Departments ──────────────────────────────

export const minimumSpendRuleDepartments = pgTable(
  'minimum_spend_rule_departments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    minimumSpendRuleId: text('minimum_spend_rule_id')
      .notNull()
      .references(() => minimumSpendRules.id, { onDelete: 'cascade' }),
    departmentId: text('department_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_min_spend_rule_depts_tenant_rule_dept').on(
      table.tenantId,
      table.minimumSpendRuleId,
      table.departmentId,
    ),
  ],
);

// ── Minimum Spend Charges ───────────────────────────────────────

export const minimumSpendCharges = pgTable(
  'minimum_spend_charges',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    orderLineId: text('order_line_id'),
    customerMinimumSpendRuleId: text('customer_minimum_spend_rule_id'),
    ruleAmountCents: integer('rule_amount_cents').notNull(),
    spentAmountCents: integer('spent_amount_cents').notNull().default(0),
    chargeAmountCents: integer('charge_amount_cents').notNull(),
    fromDate: date('from_date'),
    toDate: date('to_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_minimum_spend_charges_tenant_customer').on(table.tenantId, table.customerId),
  ],
);

// ── Minimum Spend Ledger ────────────────────────────────────────

export const minimumSpendLedger = pgTable(
  'minimum_spend_ledger',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerMinimumSpendRuleId: text('customer_minimum_spend_rule_id').notNull(),
    orderId: text('order_id'),
    departmentId: text('department_id'),
    description: text('description'),
    balanceCents: integer('balance_cents').notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_minimum_spend_ledger_tenant_rule').on(
      table.tenantId,
      table.customerMinimumSpendRuleId,
    ),
  ],
);
