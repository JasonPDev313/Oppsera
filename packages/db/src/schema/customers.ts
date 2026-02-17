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
  numeric,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Customers ───────────────────────────────────────────────────
export const customers = pgTable(
  'customers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    type: text('type').notNull().default('person'),
    email: text('email'),
    phone: text('phone'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    organizationName: text('organization_name'),
    displayName: text('display_name').notNull(),
    notes: text('notes'),
    tags: jsonb('tags').notNull().default('[]'),
    marketingConsent: boolean('marketing_consent').notNull().default(false),
    taxExempt: boolean('tax_exempt').notNull().default(false),
    taxExemptCertificateNumber: text('tax_exempt_certificate_number'),
    totalVisits: integer('total_visits').notNull().default(0),
    totalSpend: bigint('total_spend', { mode: 'number' }).notNull().default(0),
    lastVisitAt: timestamp('last_visit_at', { withTimezone: true }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    // NOTE: partial unique indexes (WHERE email IS NOT NULL / WHERE phone IS NOT NULL)
    // are created via raw SQL in migration. Regular indexes here for query support.
    index('idx_customers_tenant_email')
      .on(table.tenantId, table.email)
      .where(sql`email IS NOT NULL`),
    index('idx_customers_tenant_phone')
      .on(table.tenantId, table.phone)
      .where(sql`phone IS NOT NULL`),
    index('idx_customers_tenant_display_name').on(table.tenantId, table.displayName),
    index('idx_customers_tenant_last_visit').on(table.tenantId, table.lastVisitAt),
  ],
);

// ── Customer Relationships ──────────────────────────────────────
export const customerRelationships = pgTable(
  'customer_relationships',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    parentCustomerId: text('parent_customer_id')
      .notNull()
      .references(() => customers.id),
    childCustomerId: text('child_customer_id')
      .notNull()
      .references(() => customers.id),
    relationshipType: text('relationship_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_relationships_parent').on(table.tenantId, table.parentCustomerId),
    index('idx_customer_relationships_child').on(table.tenantId, table.childCustomerId),
    uniqueIndex('uq_customer_relationships_tenant_parent_child_type').on(
      table.tenantId,
      table.parentCustomerId,
      table.childCustomerId,
      table.relationshipType,
    ),
  ],
);

// ── Customer Identifiers ────────────────────────────────────────
export const customerIdentifiers = pgTable(
  'customer_identifiers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    type: text('type').notNull(),
    value: text('value').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_identifiers_tenant_customer').on(table.tenantId, table.customerId),
    uniqueIndex('uq_customer_identifiers_tenant_type_value').on(
      table.tenantId,
      table.type,
      table.value,
    ),
  ],
);

// ── Customer Activity Log ───────────────────────────────────────
export const customerActivityLog = pgTable(
  'customer_activity_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    activityType: text('activity_type').notNull(),
    title: text('title').notNull(),
    details: text('details'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_customer_activity_log_tenant_customer_created').on(
      table.tenantId,
      table.customerId,
      table.createdAt,
    ),
  ],
);

// ── Membership Plans ────────────────────────────────────────────
export const membershipPlans = pgTable(
  'membership_plans',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    billingInterval: text('billing_interval').notNull().default('monthly'),
    priceCents: integer('price_cents').notNull(),
    billingEnabled: boolean('billing_enabled').notNull().default(true),
    privileges: jsonb('privileges').notNull().default('[]'),
    rules: jsonb('rules'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_plans_tenant_active').on(table.tenantId, table.isActive),
  ],
);

// ── Customer Memberships (plan enrollment) ──────────────────────
export const customerMemberships = pgTable(
  'customer_memberships',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    planId: text('plan_id')
      .notNull()
      .references(() => membershipPlans.id),
    billingAccountId: text('billing_account_id').notNull(), // NO DB-level FK — cross-table, enforced in app
    status: text('status').notNull().default('pending'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    renewalDate: date('renewal_date'),
    cancelReason: text('cancel_reason'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_memberships_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_customer_memberships_tenant_billing').on(table.tenantId, table.billingAccountId),
    index('idx_customer_memberships_tenant_status').on(table.tenantId, table.status),
    index('idx_customer_memberships_tenant_renewal').on(table.tenantId, table.renewalDate),
  ],
);

// ── Membership Billing Events ───────────────────────────────────
export const membershipBillingEvents = pgTable(
  'membership_billing_events',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    membershipId: text('membership_id')
      .notNull()
      .references(() => customerMemberships.id),
    eventType: text('event_type').notNull(),
    billingPeriodStart: date('billing_period_start').notNull(),
    billingPeriodEnd: date('billing_period_end').notNull(),
    amountCents: integer('amount_cents').notNull(),
    arTransactionId: text('ar_transaction_id'),
    failureReason: text('failure_reason'),
    attemptNumber: integer('attempt_number').notNull().default(1),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_membership_billing_events_tenant_membership_period').on(
      table.tenantId,
      table.membershipId,
      table.billingPeriodStart,
    ),
    index('idx_membership_billing_events_tenant_type').on(table.tenantId, table.eventType),
  ],
);

// ── Billing Accounts ────────────────────────────────────────────
export const billingAccounts = pgTable(
  'billing_accounts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    primaryCustomerId: text('primary_customer_id')
      .notNull()
      .references(() => customers.id),
    status: text('status').notNull().default('active'),
    collectionStatus: text('collection_status').notNull().default('normal'),
    creditLimitCents: bigint('credit_limit_cents', { mode: 'number' }),
    currentBalanceCents: bigint('current_balance_cents', { mode: 'number' }).notNull().default(0),
    billingCycle: text('billing_cycle').notNull().default('monthly'),
    statementDayOfMonth: integer('statement_day_of_month'),
    dueDays: integer('due_days').notNull().default(30),
    lateFeePolicyId: text('late_fee_policy_id'),
    autoPayEnabled: boolean('auto_pay_enabled').notNull().default(false),
    taxExempt: boolean('tax_exempt').notNull().default(false),
    taxExemptCertificateNumber: text('tax_exempt_certificate_number'),
    authorizationRules: jsonb('authorization_rules'),
    billingEmail: text('billing_email'),
    billingContactName: text('billing_contact_name'),
    billingAddress: text('billing_address'),
    glArAccountCode: text('gl_ar_account_code').notNull().default('1200'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_billing_accounts_tenant_customer').on(table.tenantId, table.primaryCustomerId),
    index('idx_billing_accounts_tenant_status').on(table.tenantId, table.status),
    index('idx_billing_accounts_tenant_collection').on(table.tenantId, table.collectionStatus),
  ],
);

// ── Billing Account Members ─────────────────────────────────────
export const billingAccountMembers = pgTable(
  'billing_account_members',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billingAccountId: text('billing_account_id')
      .notNull()
      .references(() => billingAccounts.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    role: text('role').notNull(),
    chargeAllowed: boolean('charge_allowed').notNull().default(true),
    spendingLimitCents: bigint('spending_limit_cents', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_billing_account_members_tenant_account').on(
      table.tenantId,
      table.billingAccountId,
    ),
    index('idx_billing_account_members_tenant_customer').on(table.tenantId, table.customerId),
    uniqueIndex('uq_billing_account_members_tenant_account_customer').on(
      table.tenantId,
      table.billingAccountId,
      table.customerId,
    ),
  ],
);

// ── AR Transactions (accounts receivable ledger — append-only) ──
export const arTransactions = pgTable(
  'ar_transactions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billingAccountId: text('billing_account_id')
      .notNull()
      .references(() => billingAccounts.id),
    type: text('type').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    dueDate: date('due_date'),
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    customerId: text('customer_id'),
    glJournalEntryId: text('gl_journal_entry_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    index('idx_ar_transactions_tenant_account_created').on(
      table.tenantId,
      table.billingAccountId,
      table.createdAt,
    ),
    index('idx_ar_transactions_tenant_account_due').on(
      table.tenantId,
      table.billingAccountId,
      table.dueDate,
    ),
    index('idx_ar_transactions_tenant_type').on(table.tenantId, table.type),
    index('idx_ar_transactions_reference').on(table.referenceType, table.referenceId),
  ],
);

// ── AR Allocations (payment-to-charge mapping) ──────────────────
export const arAllocations = pgTable(
  'ar_allocations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    paymentTransactionId: text('payment_transaction_id')
      .notNull()
      .references(() => arTransactions.id),
    chargeTransactionId: text('charge_transaction_id')
      .notNull()
      .references(() => arTransactions.id),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ar_allocations_tenant_payment').on(table.tenantId, table.paymentTransactionId),
    index('idx_ar_allocations_tenant_charge').on(table.tenantId, table.chargeTransactionId),
    uniqueIndex('uq_ar_allocations_tenant_payment_charge').on(
      table.tenantId,
      table.paymentTransactionId,
      table.chargeTransactionId,
    ),
  ],
);

// ── Statements (monthly snapshots) ──────────────────────────────
export const statements = pgTable(
  'statements',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billingAccountId: text('billing_account_id')
      .notNull()
      .references(() => billingAccounts.id),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    openingBalanceCents: bigint('opening_balance_cents', { mode: 'number' }).notNull(),
    chargesCents: bigint('charges_cents', { mode: 'number' }).notNull(),
    paymentsCents: bigint('payments_cents', { mode: 'number' }).notNull(),
    lateFeesCents: bigint('late_fees_cents', { mode: 'number' }).notNull().default(0),
    closingBalanceCents: bigint('closing_balance_cents', { mode: 'number' }).notNull(),
    dueDate: date('due_date').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_statements_tenant_account_period').on(
      table.tenantId,
      table.billingAccountId,
      table.periodEnd,
    ),
    index('idx_statements_tenant_status').on(table.tenantId, table.status),
    uniqueIndex('uq_statements_tenant_account_period').on(
      table.tenantId,
      table.billingAccountId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

// ── Late Fee Policies ───────────────────────────────────────────
export const lateFeePolicies = pgTable(
  'late_fee_policies',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    type: text('type').notNull(),
    value: numeric('value', { precision: 12, scale: 4 }).notNull(),
    graceDays: integer('grace_days').notNull().default(0),
    maxFeeCents: bigint('max_fee_cents', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_late_fee_policies_tenant').on(table.tenantId)],
);

// ── Customer Privileges (manual overrides) ──────────────────────
export const customerPrivileges = pgTable(
  'customer_privileges',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    privilegeType: text('privilege_type').notNull(),
    value: jsonb('value').notNull(),
    reason: text('reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    index('idx_customer_privileges_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_customer_privileges_tenant_customer_type').on(
      table.tenantId,
      table.customerId,
      table.privilegeType,
    ),
  ],
);

// ── Pricing Tiers (member vs public pricing) ────────────────────
export const pricingTiers = pgTable(
  'pricing_tiers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    rules: jsonb('rules'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pricing_tiers_tenant_name').on(table.tenantId, table.name),
    index('idx_pricing_tiers_tenant_default').on(table.tenantId, table.isDefault),
  ],
);
