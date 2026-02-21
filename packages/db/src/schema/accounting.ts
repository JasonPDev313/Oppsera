import {
  pgTable,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  date,
  numeric,
  bigint,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── gl_classifications ──────────────────────────────────────────
// Groupings for chart of accounts (e.g., Current Assets, Long-term Liabilities).
export const glClassifications = pgTable(
  'gl_classifications',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    accountType: text('account_type').notNull(), // 'asset','liability','equity','revenue','expense'
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_gl_classifications_tenant_name').on(table.tenantId, table.name),
    index('idx_gl_classifications_tenant_type').on(table.tenantId, table.accountType),
  ],
);

// ── gl_accounts (Chart of Accounts) ─────────────────────────────
export const glAccounts = pgTable(
  'gl_accounts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    accountNumber: text('account_number').notNull(),
    name: text('name').notNull(),
    accountType: text('account_type').notNull(), // 'asset','liability','equity','revenue','expense'
    normalBalance: text('normal_balance').notNull(), // 'debit' or 'credit'
    classificationId: text('classification_id').references(() => glClassifications.id),
    parentAccountId: text('parent_account_id'), // self-reference for sub-accounts
    isActive: boolean('is_active').notNull().default(true),
    isControlAccount: boolean('is_control_account').notNull().default(false),
    controlAccountType: text('control_account_type'), // 'ap','ar','sales_tax','undeposited_funds','bank', null
    allowManualPosting: boolean('allow_manual_posting').notNull().default(true),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_gl_accounts_tenant_number').on(table.tenantId, table.accountNumber),
    index('idx_gl_accounts_tenant_type').on(table.tenantId, table.accountType),
    index('idx_gl_accounts_tenant_active').on(table.tenantId, table.isActive),
  ],
);

// ── gl_journal_entries ──────────────────────────────────────────
export const glJournalEntries = pgTable(
  'gl_journal_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    journalNumber: bigint('journal_number', { mode: 'number' }).notNull(),
    sourceModule: text('source_module').notNull(), // 'manual','pos','inventory','ap','ar','membership','payroll'
    sourceReferenceId: text('source_reference_id'),
    businessDate: date('business_date').notNull(),
    postingPeriod: text('posting_period').notNull(), // 'YYYY-MM'
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull(), // 'draft','posted','voided'
    memo: text('memo'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    reversalOfId: text('reversal_of_id'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_gl_journal_entries_tenant_number').on(table.tenantId, table.journalNumber),
    uniqueIndex('uq_gl_journal_entries_tenant_src_ref')
      .on(table.tenantId, table.sourceModule, table.sourceReferenceId)
      .where(sql`source_reference_id IS NOT NULL`),
    index('idx_gl_journal_entries_tenant_date').on(table.tenantId, table.businessDate),
    index('idx_gl_journal_entries_tenant_status').on(table.tenantId, table.status),
    index('idx_gl_journal_entries_tenant_period').on(table.tenantId, table.postingPeriod),
  ],
);

// ── gl_journal_lines ────────────────────────────────────────────
export const glJournalLines = pgTable(
  'gl_journal_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    journalEntryId: text('journal_entry_id')
      .notNull()
      .references(() => glJournalEntries.id),
    accountId: text('account_id')
      .notNull()
      .references(() => glAccounts.id),
    debitAmount: numeric('debit_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    creditAmount: numeric('credit_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    locationId: text('location_id'),
    departmentId: text('department_id'),
    customerId: text('customer_id'),
    vendorId: text('vendor_id'),
    memo: text('memo'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('idx_gl_journal_lines_entry').on(table.journalEntryId),
    index('idx_gl_journal_lines_account').on(table.accountId),
    index('idx_gl_journal_lines_location').on(table.locationId),
    index('idx_gl_journal_lines_account_entry').on(table.accountId, table.journalEntryId),
  ],
);

// ── gl_journal_number_counters ──────────────────────────────────
export const glJournalNumberCounters = pgTable('gl_journal_number_counters', {
  tenantId: text('tenant_id').primaryKey(),
  lastNumber: bigint('last_number', { mode: 'number' }).notNull().default(0),
});

// ── accounting_settings ─────────────────────────────────────────
// One row per tenant. Configures GL behavior.
export const accountingSettings = pgTable('accounting_settings', {
  tenantId: text('tenant_id')
    .primaryKey()
    .references(() => tenants.id),
  baseCurrency: text('base_currency').notNull().default('USD'),
  fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1),
  autoPostMode: text('auto_post_mode').notNull().default('auto_post'), // 'auto_post' or 'draft_only'
  lockPeriodThrough: text('lock_period_through'), // 'YYYY-MM'
  defaultAPControlAccountId: text('default_ap_control_account_id'),
  defaultARControlAccountId: text('default_ar_control_account_id'),
  defaultSalesTaxPayableAccountId: text('default_sales_tax_payable_account_id'),
  defaultUndepositedFundsAccountId: text('default_undeposited_funds_account_id'),
  defaultRetainedEarningsAccountId: text('default_retained_earnings_account_id'),
  defaultRoundingAccountId: text('default_rounding_account_id'),
  roundingToleranceCents: integer('rounding_tolerance_cents').notNull().default(5),
  defaultPmsGuestLedgerAccountId: text('default_pms_guest_ledger_account_id'),
  enableCogsPosting: boolean('enable_cogs_posting').notNull().default(false),
  enableInventoryPosting: boolean('enable_inventory_posting').notNull().default(false),
  postByLocation: boolean('post_by_location').notNull().default(true),
  enableUndepositedFundsWorkflow: boolean('enable_undeposited_funds_workflow').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── gl_unmapped_events ──────────────────────────────────────────
// Tracks missing GL mappings encountered during posting.
export const glUnmappedEvents = pgTable(
  'gl_unmapped_events',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventType: text('event_type').notNull(), // 'missing_revenue_account', etc.
    sourceModule: text('source_module').notNull(),
    sourceReferenceId: text('source_reference_id'),
    entityType: text('entity_type').notNull(), // 'sub_department','payment_type','vendor','tax_group'
    entityId: text('entity_id').notNull(),
    reason: text('reason').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_gl_unmapped_events_tenant_unresolved')
      .on(table.tenantId, table.resolvedAt)
      .where(sql`resolved_at IS NULL`),
    index('idx_gl_unmapped_events_tenant_type').on(table.tenantId, table.eventType),
  ],
);

// ── gl_account_templates ────────────────────────────────────────
// System-level seed data for tenant COA bootstrap. No tenantId.
export const glAccountTemplates = pgTable(
  'gl_account_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    templateKey: text('template_key').notNull(), // 'golf_default','retail_default','restaurant_default','hybrid_default'
    accountNumber: text('account_number').notNull(),
    name: text('name').notNull(),
    accountType: text('account_type').notNull(),
    normalBalance: text('normal_balance').notNull(),
    classificationName: text('classification_name').notNull(),
    isControlAccount: boolean('is_control_account').notNull().default(false),
    controlAccountType: text('control_account_type'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('idx_gl_account_templates_key').on(table.templateKey),
  ],
);

// ── gl_classification_templates ─────────────────────────────────
// System-level seed data for classification bootstrap. No tenantId.
export const glClassificationTemplates = pgTable(
  'gl_classification_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    templateKey: text('template_key').notNull(),
    name: text('name').notNull(),
    accountType: text('account_type').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('idx_gl_classification_templates_key').on(table.templateKey),
  ],
);

// ── accounting_close_periods ────────────────────────────────────
export const accountingClosePeriods = pgTable(
  'accounting_close_periods',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    postingPeriod: text('posting_period').notNull(), // 'YYYY-MM'
    status: text('status').notNull().default('open'), // 'open', 'in_review', 'closed'
    checklist: jsonb('checklist').notNull().default({}),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: text('closed_by'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_accounting_close_periods_tenant_period').on(table.tenantId, table.postingPeriod),
    index('idx_accounting_close_periods_status').on(table.tenantId, table.status),
  ],
);

// ── financial_statement_layouts ─────────────────────────────────
// Configurable statement structure (profit & loss, balance sheet).
export const financialStatementLayouts = pgTable(
  'financial_statement_layouts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    statementType: text('statement_type').notNull(), // 'profit_loss', 'balance_sheet'
    name: text('name').notNull(),
    sections: jsonb('sections').notNull(), // ordered array of { label, classificationIds[], accountIds[], subtotalLabel?, isTotal? }
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_financial_stmt_layouts_tenant_type_name').on(table.tenantId, table.statementType, table.name),
    index('idx_financial_stmt_layouts_tenant_type').on(table.tenantId, table.statementType),
  ],
);

// ── financial_statement_layout_templates ─────────────────────────
// System-level seed data for statement layouts. No tenantId.
export const financialStatementLayoutTemplates = pgTable(
  'financial_statement_layout_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    templateKey: text('template_key').notNull(),
    statementType: text('statement_type').notNull(),
    name: text('name').notNull(),
    sections: jsonb('sections').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('idx_financial_stmt_layout_templates_key').on(table.templateKey),
  ],
);
