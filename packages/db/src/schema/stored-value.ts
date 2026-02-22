import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { customers } from './customers';

// ── Stored Value Instruments ─────────────────────────────────────────
// Umbrella for gift cards, credit books, rainchecks, range cards,
// rounds cards, prepaid balances, punchcards, awards.

export const storedValueInstruments = pgTable(
  'stored_value_instruments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').references(() => customers.id),
    instrumentType: text('instrument_type').notNull(), // 'gift_card', 'credit_book', 'raincheck', 'range_card', 'rounds_card', 'prepaid_balance', 'punchcard', 'award'
    code: text('code').notNull(),
    status: text('status').notNull().default('active'), // 'active', 'frozen', 'expired', 'redeemed', 'voided'
    initialValueCents: integer('initial_value_cents').notNull().default(0),
    currentBalanceCents: integer('current_balance_cents').notNull().default(0),
    unitCount: integer('unit_count'), // for rounds/punchcard types
    unitsRemaining: integer('units_remaining'), // for rounds/punchcard types
    liabilityGlAccountId: text('liability_gl_account_id'),
    description: text('description'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    issuedBy: text('issued_by'),
    voucherId: text('voucher_id'), // link to existing vouchers table if migrated
    metaJson: jsonb('meta_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_svi_tenant_code').on(table.tenantId, table.code),
    index('idx_svi_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_svi_tenant_type_status').on(table.tenantId, table.instrumentType, table.status),
  ],
);

// ── Stored Value Transactions ────────────────────────────────────────
// Append-only ledger for all stored value movements.

export const storedValueTransactions = pgTable(
  'stored_value_transactions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => storedValueInstruments.id),
    customerId: text('customer_id'),
    txnType: text('txn_type').notNull(), // 'issue', 'redeem', 'reload', 'transfer_in', 'transfer_out', 'void', 'refund', 'expire', 'adjust'
    amountCents: integer('amount_cents').notNull(), // signed: positive for issue/reload/refund/transfer_in, negative for redeem/transfer_out/void/expire
    unitDelta: integer('unit_delta'), // for rounds/punchcard
    runningBalanceCents: integer('running_balance_cents').notNull(), // snapshot of balance after this txn
    sourceModule: text('source_module'), // 'pos', 'membership', 'admin', 'system'
    sourceId: text('source_id'), // order ID, etc.
    ledgerEntryId: text('ledger_entry_id'), // link to AR ledger
    glJournalEntryId: text('gl_journal_entry_id'), // link to GL
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    index('idx_svt_tenant_instrument').on(table.tenantId, table.instrumentId),
    index('idx_svt_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_svt_tenant_created').on(table.tenantId, table.createdAt),
  ],
);

// ── Discount Rules ──────────────────────────────────────────────────
// Rule-based discount engine with scope, priority, conditions, and usage tracking.

export const discountRules = pgTable(
  'discount_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    scopeType: text('scope_type').notNull().default('global'), // 'global', 'membership_class', 'customer', 'segment'
    customerId: text('customer_id'), // populated when scope_type = 'customer'
    membershipClassId: text('membership_class_id'), // populated when scope_type = 'membership_class'
    segmentId: text('segment_id'), // populated when scope_type = 'segment'
    priority: integer('priority').notNull().default(100), // lower = higher priority
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    effectiveDate: date('effective_date'),
    expirationDate: date('expiration_date'),
    ruleJson: jsonb('rule_json').notNull(), // { conditions: [...], actions: [...], maxUsesPerPeriod, maxUsesPerCustomer, stackable }
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    index('idx_discount_rules_tenant_active').on(table.tenantId, table.isActive),
    index('idx_discount_rules_tenant_scope').on(table.tenantId, table.scopeType),
    index('idx_discount_rules_tenant_customer').on(table.tenantId, table.customerId),
  ],
);

// ── Discount Rule Usage ─────────────────────────────────────────────
// Track usage per rule per customer per period for max-uses enforcement.

export const discountRuleUsage = pgTable(
  'discount_rule_usage',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ruleId: text('rule_id')
      .notNull()
      .references(() => discountRules.id),
    customerId: text('customer_id').notNull(),
    periodKey: text('period_key').notNull(), // 'YYYY-MM' or 'YYYY-WNN'
    usesCount: integer('uses_count').notNull().default(0),
    amountDiscountedCents: integer('amount_discounted_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_discount_rule_usage').on(
      table.tenantId,
      table.ruleId,
      table.customerId,
      table.periodKey,
    ),
  ],
);
