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
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { statements } from './customers';

// ── Membership Accounts ─────────────────────────────────────────
export const membershipAccounts = pgTable(
  'membership_accounts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    accountNumber: text('account_number').notNull(),
    status: text('status').notNull().default('active'), // active, suspended, frozen, terminated
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    primaryMemberId: text('primary_member_id').notNull(), // FK to customers (app-enforced)
    billingEmail: text('billing_email'),
    billingAddressJson: jsonb('billing_address_json'),
    statementDayOfMonth: integer('statement_day_of_month').default(1),
    paymentTermsDays: integer('payment_terms_days').default(30),
    autopayEnabled: boolean('autopay_enabled').notNull().default(false),
    creditLimitCents: bigint('credit_limit_cents', { mode: 'number' }).notNull().default(0),
    holdCharging: boolean('hold_charging').notNull().default(false),
    billingAccountId: text('billing_account_id'), // link to existing billing_accounts
    customerId: text('customer_id'), // primary customer link
    notes: text('notes'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_membership_accounts_tenant_number').on(table.tenantId, table.accountNumber),
    index('idx_membership_accounts_tenant_status').on(table.tenantId, table.status),
    index('idx_membership_accounts_tenant_primary').on(table.tenantId, table.primaryMemberId),
    index('idx_membership_accounts_tenant_customer').on(table.tenantId, table.customerId),
  ],
);

// ── Membership Members ──────────────────────────────────────────
export const membershipMembers = pgTable(
  'membership_members',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipAccountId: text('membership_account_id')
      .notNull()
      .references(() => membershipAccounts.id),
    customerId: text('customer_id').notNull(), // FK to customers (app-enforced)
    role: text('role').notNull().default('primary'), // primary, spouse, dependent, corporate_designee
    chargePrivileges: jsonb('charge_privileges'),
    memberNumber: text('member_number'),
    status: text('status').notNull().default('active'), // active, suspended, removed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_members_tenant_account').on(table.tenantId, table.membershipAccountId),
    index('idx_membership_members_tenant_customer').on(table.tenantId, table.customerId),
    uniqueIndex('uq_membership_members_tenant_number')
      .on(table.tenantId, table.memberNumber)
      .where(sql`member_number IS NOT NULL`),
  ],
);

// ── Membership Classes ──────────────────────────────────────────
export const membershipClasses = pgTable(
  'membership_classes',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipAccountId: text('membership_account_id')
      .notNull()
      .references(() => membershipAccounts.id),
    className: text('class_name').notNull(),
    effectiveDate: date('effective_date').notNull(),
    expirationDate: date('expiration_date'),
    billedThroughDate: date('billed_through_date'),
    isArchived: boolean('is_archived').notNull().default(false),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_classes_tenant_account').on(table.tenantId, table.membershipAccountId),
  ],
);

// ── Membership Billing Items ────────────────────────────────────
export const membershipBillingItems = pgTable(
  'membership_billing_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipAccountId: text('membership_account_id')
      .notNull()
      .references(() => membershipAccounts.id),
    classId: text('class_id').references(() => membershipClasses.id),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    frequency: text('frequency').notNull().default('monthly'), // monthly, quarterly, semi_annual, annual, one_time
    taxRateId: text('tax_rate_id'),
    glRevenueAccountId: text('gl_revenue_account_id'),
    glDeferredRevenueAccountId: text('gl_deferred_revenue_account_id'),
    prorationEnabled: boolean('proration_enabled').notNull().default(false),
    seasonalJson: jsonb('seasonal_json'),
    isSubMemberItem: boolean('is_sub_member_item').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_billing_items_tenant_account').on(table.tenantId, table.membershipAccountId),
  ],
);

// ── Membership Authorized Users ─────────────────────────────────
export const membershipAuthorizedUsers = pgTable(
  'membership_authorized_users',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipAccountId: text('membership_account_id')
      .notNull()
      .references(() => membershipAccounts.id),
    name: text('name').notNull(),
    relationship: text('relationship'),
    privilegesJson: jsonb('privileges_json'),
    effectiveDate: date('effective_date'),
    expirationDate: date('expiration_date'),
    status: text('status').notNull().default('active'), // active, expired, revoked
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_auth_users_tenant_account').on(table.tenantId, table.membershipAccountId),
  ],
);

// ── Membership Accounting Settings ──────────────────────────────
export const membershipAccountingSettings = pgTable(
  'membership_accounting_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    clubModel: text('club_model').notNull().default('for_profit'), // for_profit, member_owned
    recognitionPolicy: jsonb('recognition_policy'),
    defaultDuesRevenueAccountId: text('default_dues_revenue_account_id'),
    defaultDeferredRevenueAccountId: text('default_deferred_revenue_account_id'),
    defaultInitiationRevenueAccountId: text('default_initiation_revenue_account_id'),
    defaultNotesReceivableAccountId: text('default_notes_receivable_account_id'),
    defaultInterestIncomeAccountId: text('default_interest_income_account_id'),
    defaultCapitalContributionAccountId: text('default_capital_contribution_account_id'),
    defaultBadDebtAccountId: text('default_bad_debt_account_id'),
    defaultLateFeeAccountId: text('default_late_fee_account_id'),
    defaultMinimumRevenueAccountId: text('default_minimum_revenue_account_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_membership_accounting_settings_tenant').on(table.tenantId),
  ],
);

// ── Membership Subscriptions (Session 6, migration 0128) ─────────
export const membershipSubscriptions = pgTable(
  'membership_subscriptions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipAccountId: text('membership_account_id')
      .notNull()
      .references(() => membershipAccounts.id),
    planId: text('plan_id').notNull(), // FK to membership_plans (app-enforced, lives in customers.ts)
    status: text('status').notNull().default('active'), // active, paused, canceled, pending
    effectiveStart: date('effective_start').notNull(),
    effectiveEnd: date('effective_end'),
    nextBillDate: date('next_bill_date'),
    lastBilledDate: date('last_billed_date'),
    billedThroughDate: date('billed_through_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_subscriptions_tenant_account').on(table.tenantId, table.membershipAccountId),
    index('idx_membership_subscriptions_tenant_status').on(table.tenantId, table.status),
    index('idx_membership_subscriptions_tenant_next_bill').on(table.tenantId, table.nextBillDate),
  ],
);

// ── Statement Lines (Session 6, migration 0128) ──────────────────
export const statementLines = pgTable(
  'statement_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    statementId: text('statement_id')
      .notNull()
      .references(() => statements.id),
    lineType: text('line_type').notNull(), // dues, initiation, minimum, late_fee, payment, credit, adjustment, other
    description: text('description').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    sourceTransactionId: text('source_transaction_id'), // FK to ar_transactions (app-enforced)
    departmentId: text('department_id'),
    metaJson: jsonb('meta_json'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_statement_lines_tenant_statement').on(table.tenantId, table.statementId),
  ],
);

// ── Initiation Contracts (Session 8, migration 0130) ──────────────
export const initiationContracts = pgTable(
  'initiation_contracts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    membershipAccountId: text('membership_account_id').notNull(),
    contractDate: date('contract_date').notNull(),
    initiationFeeCents: bigint('initiation_fee_cents', { mode: 'number' }).notNull(),
    downPaymentCents: bigint('down_payment_cents', { mode: 'number' }).notNull().default(0),
    financedPrincipalCents: bigint('financed_principal_cents', { mode: 'number' }).notNull(),
    aprBps: integer('apr_bps').notNull().default(0),
    termMonths: integer('term_months').notNull(),
    paymentDayOfMonth: integer('payment_day_of_month').notNull().default(1),
    status: text('status').notNull().default('active'),
    recognitionPolicySnapshot: jsonb('recognition_policy_snapshot').notNull(),
    glInitiationRevenueAccountId: text('gl_initiation_revenue_account_id'),
    glNotesReceivableAccountId: text('gl_notes_receivable_account_id'),
    glInterestIncomeAccountId: text('gl_interest_income_account_id'),
    glCapitalContributionAccountId: text('gl_capital_contribution_account_id'),
    glDeferredRevenueAccountId: text('gl_deferred_revenue_account_id'),
    paidPrincipalCents: bigint('paid_principal_cents', { mode: 'number' }).notNull().default(0),
    paidInterestCents: bigint('paid_interest_cents', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_initiation_contracts_tenant_account').on(table.tenantId, table.membershipAccountId),
    index('idx_initiation_contracts_tenant_status').on(table.tenantId, table.status),
  ],
);

// ── Initiation Amortization Schedule (Session 8, migration 0130) ──
export const initiationAmortSchedule = pgTable(
  'initiation_amort_schedule',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    contractId: text('contract_id').notNull().references(() => initiationContracts.id),
    periodIndex: integer('period_index').notNull(),
    dueDate: date('due_date').notNull(),
    paymentCents: bigint('payment_cents', { mode: 'number' }).notNull(),
    principalCents: bigint('principal_cents', { mode: 'number' }).notNull(),
    interestCents: bigint('interest_cents', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('scheduled'),
    arTransactionId: text('ar_transaction_id'),
    billedAt: timestamp('billed_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_initiation_amort_contract').on(table.tenantId, table.contractId),
    index('idx_initiation_amort_due_date').on(table.tenantId, table.dueDate),
    uniqueIndex('uq_initiation_amort_contract_period').on(table.tenantId, table.contractId, table.periodIndex),
  ],
);

// ── Autopay Profiles (Session 9, migration 0131) ──────────────────
export const autopayProfiles = pgTable(
  'autopay_profiles',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    membershipAccountId: text('membership_account_id').notNull(),
    paymentMethodId: text('payment_method_id'),
    strategy: text('strategy').notNull().default('full_balance'),
    fixedAmountCents: bigint('fixed_amount_cents', { mode: 'number' }).default(0),
    selectedAccountTypes: jsonb('selected_account_types'),
    isActive: boolean('is_active').notNull().default(true),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_autopay_profiles_tenant_account').on(table.tenantId, table.membershipAccountId),
    index('idx_autopay_profiles_tenant_active').on(table.tenantId, table.isActive),
  ],
);

// ── Autopay Runs (Session 9, migration 0131) ──────────────────────
export const autopayRuns = pgTable(
  'autopay_runs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    runDate: date('run_date').notNull(),
    status: text('status').notNull().default('pending'),
    totalProfilesCount: integer('total_profiles_count').notNull().default(0),
    successCount: integer('success_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    totalCollectedCents: bigint('total_collected_cents', { mode: 'number' }).notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_autopay_runs_tenant_date').on(table.tenantId, table.runDate),
    index('idx_autopay_runs_tenant_status').on(table.tenantId, table.status),
  ],
);

// ── Autopay Attempts (Session 9, migration 0131) ──────────────────
export const autopayAttempts = pgTable(
  'autopay_attempts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    runId: text('run_id').notNull().references(() => autopayRuns.id),
    membershipAccountId: text('membership_account_id').notNull(),
    paymentMethodId: text('payment_method_id'),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('pending'),
    failureReason: text('failure_reason'),
    attemptNumber: integer('attempt_number').notNull().default(1),
    arTransactionId: text('ar_transaction_id'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_autopay_attempts_tenant_run').on(table.tenantId, table.runId),
    index('idx_autopay_attempts_tenant_account').on(table.tenantId, table.membershipAccountId),
    index('idx_autopay_attempts_tenant_status').on(table.tenantId, table.status),
  ],
);

// ── Late Fee Assessments (Session 9, migration 0131) ──────────────
export const lateFeeAssessments = pgTable(
  'late_fee_assessments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    membershipAccountId: text('membership_account_id').notNull(),
    assessmentDate: date('assessment_date').notNull(),
    overdueAmountCents: bigint('overdue_amount_cents', { mode: 'number' }).notNull(),
    feeAmountCents: bigint('fee_amount_cents', { mode: 'number' }).notNull(),
    arTransactionId: text('ar_transaction_id'),
    waived: boolean('waived').notNull().default(false),
    waivedBy: text('waived_by'),
    waivedReason: text('waived_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_late_fee_assessments_tenant_account').on(table.tenantId, table.membershipAccountId),
    index('idx_late_fee_assessments_tenant_date').on(table.tenantId, table.assessmentDate),
  ],
);

// ── Membership Holds (Session 9, migration 0131) ──────────────────
export const membershipHolds = pgTable(
  'membership_holds',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    membershipAccountId: text('membership_account_id').notNull(),
    holdType: text('hold_type').notNull().default('charging'),
    reason: text('reason').notNull(),
    placedBy: text('placed_by').notNull(),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    liftedBy: text('lifted_by'),
    liftedAt: timestamp('lifted_at', { withTimezone: true }),
    liftedReason: text('lifted_reason'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_holds_tenant_account').on(table.tenantId, table.membershipAccountId),
    index('idx_membership_holds_tenant_active').on(table.tenantId, table.isActive),
  ],
);

// ── Billing Cycle Runs (Session 10, migration 0132) ───────────────
export const billingCycleRuns = pgTable(
  'billing_cycle_runs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    cycleDate: date('cycle_date').notNull(),
    status: text('status').notNull().default('preview'), // preview, in_progress, completed, cancelled
    steps: jsonb('steps').notNull().default([]),
    startedBy: text('started_by'),
    previewSummary: jsonb('preview_summary'),
    totalDuesBilledCents: bigint('total_dues_billed_cents', { mode: 'number' }).notNull().default(0),
    totalInitiationBilledCents: bigint('total_initiation_billed_cents', { mode: 'number' }).notNull().default(0),
    totalMinimumsChargedCents: bigint('total_minimums_charged_cents', { mode: 'number' }).notNull().default(0),
    totalLateFeesCents: bigint('total_late_fees_cents', { mode: 'number' }).notNull().default(0),
    totalStatementsGenerated: integer('total_statements_generated').notNull().default(0),
    totalAutopayCollectedCents: bigint('total_autopay_collected_cents', { mode: 'number' }).notNull().default(0),
    exceptionsJson: jsonb('exceptions_json'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_billing_cycle_runs_tenant_date').on(table.tenantId, table.cycleDate),
    index('idx_billing_cycle_runs_tenant_status').on(table.tenantId, table.status),
  ],
);


// ── Reporting Read Models (CQRS) ─────────────────────────────────

export const rmMembershipAging = pgTable(
  'rm_membership_aging',
  {
    id: text('id').primaryKey().$defaultFn(() => generateUlid()),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    membershipAccountId: text('membership_account_id').notNull(),
    asOfDate: date('as_of_date').notNull(),
    currentCents: bigint('current_cents', { mode: 'number' }).notNull().default(0),
    days1To30Cents: bigint('days_1_30_cents', { mode: 'number' }).notNull().default(0),
    days31To60Cents: bigint('days_31_60_cents', { mode: 'number' }).notNull().default(0),
    days61To90Cents: bigint('days_61_90_cents', { mode: 'number' }).notNull().default(0),
    daysOver90Cents: bigint('days_over_90_cents', { mode: 'number' }).notNull().default(0),
    totalOutstandingCents: bigint('total_outstanding_cents', { mode: 'number' }).notNull().default(0),
    lastPaymentDate: date('last_payment_date'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_rm_membership_aging').on(t.tenantId, t.membershipAccountId, t.asOfDate),
    index('idx_rm_membership_aging_tenant').on(t.tenantId),
  ],
);

export const rmMembershipCompliance = pgTable(
  'rm_membership_compliance',
  {
    id: text('id').primaryKey().$defaultFn(() => generateUlid()),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    membershipAccountId: text('membership_account_id').notNull(),
    periodKey: text('period_key').notNull(),
    requiredCents: bigint('required_cents', { mode: 'number' }).notNull().default(0),
    satisfiedCents: bigint('satisfied_cents', { mode: 'number' }).notNull().default(0),
    shortfallCents: bigint('shortfall_cents', { mode: 'number' }).notNull().default(0),
    compliancePct: text('compliance_pct').notNull().default('0'),
    status: text('status').notNull().default('on_track'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_rm_membership_compliance').on(t.tenantId, t.membershipAccountId, t.periodKey),
    index('idx_rm_membership_compliance_tenant').on(t.tenantId),
  ],
);

export const rmMembershipSpend = pgTable(
  'rm_membership_spend',
  {
    id: text('id').primaryKey().$defaultFn(() => generateUlid()),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    membershipAccountId: text('membership_account_id').notNull(),
    periodKey: text('period_key').notNull(),
    category: text('category').notNull(),
    spendCents: bigint('spend_cents', { mode: 'number' }).notNull().default(0),
    transactionCount: integer('transaction_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_rm_membership_spend').on(t.tenantId, t.membershipAccountId, t.periodKey, t.category),
    index('idx_rm_membership_spend_tenant').on(t.tenantId),
  ],
);

export const rmMembershipChurn = pgTable(
  'rm_membership_churn',
  {
    id: text('id').primaryKey().$defaultFn(() => generateUlid()),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    membershipAccountId: text('membership_account_id').notNull(),
    riskScore: text('risk_score').notNull().default('0'),
    riskLevel: text('risk_level').notNull().default('low'),
    daysSinceLastVisit: integer('days_since_last_visit'),
    visitTrend: text('visit_trend'),
    spendTrend: text('spend_trend'),
    autopayFailures: integer('autopay_failures').notNull().default(0),
    hasHold: boolean('has_hold').notNull().default(false),
    hasLateFees: boolean('has_late_fees').notNull().default(false),
    predictedChurnMonth: text('predicted_churn_month'),
    factorsJson: jsonb('factors_json'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_rm_membership_churn').on(t.tenantId, t.membershipAccountId),
    index('idx_rm_membership_churn_tenant').on(t.tenantId),
    index('idx_rm_membership_churn_risk').on(t.tenantId, t.riskLevel),
  ],
);

export const rmMembershipPortfolio = pgTable(
  'rm_membership_portfolio',
  {
    id: text('id').primaryKey().$defaultFn(() => generateUlid()),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    asOfDate: date('as_of_date').notNull(),
    totalAccounts: integer('total_accounts').notNull().default(0),
    activeAccounts: integer('active_accounts').notNull().default(0),
    suspendedAccounts: integer('suspended_accounts').notNull().default(0),
    frozenAccounts: integer('frozen_accounts').notNull().default(0),
    terminatedAccounts: integer('terminated_accounts').notNull().default(0),
    totalArCents: bigint('total_ar_cents', { mode: 'number' }).notNull().default(0),
    totalDeferredRevenueCents: bigint('total_deferred_revenue_cents', { mode: 'number' }).notNull().default(0),
    avgAccountAgeDays: integer('avg_account_age_days'),
    newAccountsThisMonth: integer('new_accounts_this_month').notNull().default(0),
    terminatedThisMonth: integer('terminated_this_month').notNull().default(0),
    netMemberGrowth: integer('net_member_growth').notNull().default(0),
    totalDuesRevenueCents: bigint('total_dues_revenue_cents', { mode: 'number' }).notNull().default(0),
    totalInitiationRevenueCents: bigint('total_initiation_revenue_cents', { mode: 'number' }).notNull().default(0),
    totalMinimumRevenueCents: bigint('total_minimum_revenue_cents', { mode: 'number' }).notNull().default(0),
    totalLateFeeRevenueCents: bigint('total_late_fee_revenue_cents', { mode: 'number' }).notNull().default(0),
    autopayAdoptionPct: text('autopay_adoption_pct').notNull().default('0'),
    avgCollectionDays: text('avg_collection_days'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_rm_membership_portfolio').on(t.tenantId, t.asOfDate),
    index('idx_rm_membership_portfolio_tenant').on(t.tenantId),
  ],
);
