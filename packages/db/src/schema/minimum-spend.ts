import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
  jsonb,
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

    // ── Session 7 fields (migration 0129) ──
    bucketType: text('bucket_type'), // food_beverage, retail, golf, service, all, custom
    allocationMethod: text('allocation_method').default('first_match'), // first_match, proportional, priority
    rolloverPolicy: text('rollover_policy').default('none'), // none, monthly_to_monthly, within_quarter
    excludeTax: boolean('exclude_tax').notNull().default(true),
    excludeTips: boolean('exclude_tips').notNull().default(true),
    excludeServiceCharges: boolean('exclude_service_charges').notNull().default(true),
    excludeDues: boolean('exclude_dues').notNull().default(true),

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

// ── Customer Minimum Spend Rules ────────────────────────────────
// Per-customer assignment linking a customer to a minimum_spend_rule template

export const customerMinimumSpendRules = pgTable(
  'customer_minimum_spend_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    minimumSpendRuleId: text('minimum_spend_rule_id')
      .notNull()
      .references(() => minimumSpendRules.id),
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_min_spend_rules_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_customer_min_spend_rules_tenant_rule').on(table.tenantId, table.minimumSpendRuleId),
  ],
);

// ── Customer Minimum Spend Rule Departments ─────────────────────

export const customerMinimumSpendRuleDepartments = pgTable(
  'customer_minimum_spend_rule_departments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerMinimumSpendRuleId: text('customer_minimum_spend_rule_id')
      .notNull()
      .references(() => customerMinimumSpendRules.id, { onDelete: 'cascade' }),
    departmentId: text('department_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_customer_min_spend_rule_depts_tenant_rule_dept').on(
      table.tenantId,
      table.customerMinimumSpendRuleId,
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

// ── Minimum Eligibility Rules (Session 7, migration 0129) ───────

export const minimumEligibilityRules = pgTable(
  'minimum_eligibility_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ruleId: text('rule_id').notNull(),
    condition: jsonb('condition').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_minimum_eligibility_rules_tenant_rule').on(table.tenantId, table.ruleId),
  ],
);

// ── Minimum Period Rollups (Session 7, migration 0129) ──────────

export const minimumPeriodRollups = pgTable(
  'minimum_period_rollups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    minimumSpendRuleId: text('minimum_spend_rule_id').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    requiredCents: bigint('required_cents', { mode: 'number' }).notNull().default(0),
    satisfiedCents: bigint('satisfied_cents', { mode: 'number' }).notNull().default(0),
    shortfallCents: bigint('shortfall_cents', { mode: 'number' }).notNull().default(0),
    rolloverInCents: bigint('rollover_in_cents', { mode: 'number' }).notNull().default(0),
    rolloverOutCents: bigint('rollover_out_cents', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull().default('open'), // open, closed, billed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_minimum_period_rollups_tenant_customer_period').on(
      table.tenantId,
      table.customerId,
      table.periodStart,
    ),
    index('idx_minimum_period_rollups_tenant_rule_period').on(
      table.tenantId,
      table.minimumSpendRuleId,
      table.periodStart,
    ),
    index('idx_minimum_period_rollups_tenant_status').on(table.tenantId, table.status),
    uniqueIndex('uq_minimum_period_rollups_tenant_customer_rule_period').on(
      table.tenantId,
      table.customerId,
      table.minimumSpendRuleId,
      table.periodStart,
    ),
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
