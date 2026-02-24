import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  bigint,
  jsonb,
  index,
  uniqueIndex,
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
    isContraAccount: boolean('is_contra_account').notNull().default(false),
    allowManualPosting: boolean('allow_manual_posting').notNull().default(true),
    description: text('description'),
    // Governance columns (migration 0138)
    sortOrder: integer('sort_order').notNull().default(0),
    depth: integer('depth').notNull().default(0),
    path: text('path'), // materialized path "10000.10010.10020"
    isFallback: boolean('is_fallback').notNull().default(false),
    isSystemAccount: boolean('is_system_account').notNull().default(false),
    mergedIntoId: text('merged_into_id'), // references gl_accounts.id
    status: text('status').notNull().default('active'), // 'active' | 'inactive' | 'pending_merge'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_gl_accounts_tenant_number').on(table.tenantId, table.accountNumber),
    index('idx_gl_accounts_tenant_type').on(table.tenantId, table.accountType),
    index('idx_gl_accounts_tenant_active').on(table.tenantId, table.isActive),
    index('idx_gl_accounts_tenant_status').on(table.tenantId, table.status),
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
    // ── Multi-currency provisioning (migration 0121) ──
    transactionCurrency: text('transaction_currency').notNull().default('USD'),
    exchangeRate: numeric('exchange_rate', { precision: 12, scale: 6 }).notNull().default('1.000000'),
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
    profitCenterId: text('profit_center_id'),
    subDepartmentId: text('sub_department_id'),
    terminalId: text('terminal_id'),
    channel: text('channel'),
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
  enableLegacyGlPosting: boolean('enable_legacy_gl_posting').notNull().default(true),
  defaultTipsPayableAccountId: text('default_tips_payable_account_id'),
  defaultServiceChargeRevenueAccountId: text('default_service_charge_revenue_account_id'),
  defaultCashOverShortAccountId: text('default_cash_over_short_account_id'),
  defaultCompExpenseAccountId: text('default_comp_expense_account_id'),
  defaultReturnsAccountId: text('default_returns_account_id'),
  defaultPayrollClearingAccountId: text('default_payroll_clearing_account_id'),
  // ── Uncategorized revenue fallback (migration 0135) ──
  defaultUncategorizedRevenueAccountId: text('default_uncategorized_revenue_account_id'),
  // ── COGS posting mode (migration 0115) ──
  cogsPostingMode: text('cogs_posting_mode').notNull().default('disabled'), // 'disabled' | 'perpetual' | 'periodic'
  periodicCogsLastCalculatedDate: date('periodic_cogs_last_calculated_date'),
  periodicCogsMethod: text('periodic_cogs_method').default('weighted_average'), // 'weighted_average' | 'fifo' | 'standard'
  // ── Breakage income policy (migration 0120) ──
  recognizeBreakageAutomatically: boolean('recognize_breakage_automatically').notNull().default(true),
  breakageRecognitionMethod: text('breakage_recognition_method').notNull().default('on_expiry'), // 'on_expiry' | 'proportional' | 'manual_only'
  breakageIncomeAccountId: text('breakage_income_account_id'),
  voucherExpiryEnabled: boolean('voucher_expiry_enabled').notNull().default(true),
  // ── Auto-remap toggle (migration 0143) ──
  enableAutoRemap: boolean('enable_auto_remap').notNull().default(false),
  // ── ACH Receivable GL account (migration 0178) ──
  defaultAchReceivableAccountId: text('default_ach_receivable_account_id'),
  // ── Surcharge revenue GL account (migration 0184) ──
  defaultSurchargeRevenueAccountId: text('default_surcharge_revenue_account_id'),
  // ── Multi-currency provisioning (migration 0121) ──
  supportedCurrencies: text('supported_currencies').array().notNull().default(sql`'{USD}'`),
  // ── Auto-close orchestrator (migration 0187) ──
  autoCloseEnabled: boolean('auto_close_enabled').notNull().default(false),
  autoCloseTime: text('auto_close_time').default('02:00'), // HH:MM in tenant timezone
  autoCloseSkipHolidays: boolean('auto_close_skip_holidays').notNull().default(false),
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
    resolutionMethod: text('resolution_method'), // 'manual' | 'remapped'
    remappedJournalEntryId: text('remapped_journal_entry_id'),
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

// ── periodic_cogs_calculations (migration 0115) ─────────────────
// Period-end COGS calculations for periodic inventory method.
export const periodicCogsCalculations = pgTable(
  'periodic_cogs_calculations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: text('status').notNull().default('draft'), // 'draft' | 'posted'
    calculationMethod: text('calculation_method').notNull(), // 'weighted_average' | 'fifo' | 'standard'
    beginningInventoryDollars: numeric('beginning_inventory_dollars', { precision: 12, scale: 2 }).notNull(),
    purchasesDollars: numeric('purchases_dollars', { precision: 12, scale: 2 }).notNull(),
    endingInventoryDollars: numeric('ending_inventory_dollars', { precision: 12, scale: 2 }).notNull(),
    cogsDollars: numeric('cogs_dollars', { precision: 12, scale: 2 }).notNull(),
    detail: jsonb('detail'), // sub-department breakdown for GL posting
    glJournalEntryId: text('gl_journal_entry_id'),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: text('posted_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_periodic_cogs_tenant_status').on(table.tenantId, table.status),
    index('idx_periodic_cogs_tenant_period').on(table.tenantId, table.periodStart, table.periodEnd),
  ],
);

// ── gl_recurring_templates (migration 0121) ──────────────────
// Recurring journal entry templates for monthly accruals, depreciation, etc.
export const glRecurringTemplates = pgTable(
  'gl_recurring_templates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    frequency: text('frequency').notNull(), // 'monthly' | 'quarterly' | 'annually'
    dayOfPeriod: integer('day_of_period').notNull().default(1), // 1-28, 0=last day
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    isActive: boolean('is_active').notNull().default(true),
    lastPostedPeriod: text('last_posted_period'), // 'YYYY-MM'
    nextDueDate: date('next_due_date'),
    templateLines: jsonb('template_lines').notNull().default([]),
    sourceModule: text('source_module').notNull().default('recurring'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_gl_recurring_templates_tenant').on(table.tenantId),
    index('idx_gl_recurring_templates_active_due')
      .on(table.tenantId, table.isActive, table.nextDueDate)
      .where(sql`is_active = true`),
    uniqueIndex('uq_gl_recurring_templates_tenant_name').on(table.tenantId, table.name),
  ],
);

// ── gl_account_change_logs (migration 0138) ──────────────────────
// Append-only field-level change tracking for COA governance.
export const glAccountChangeLogs = pgTable(
  'gl_account_change_logs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    accountId: text('account_id')
      .notNull()
      .references(() => glAccounts.id),
    action: text('action').notNull(), // 'CREATE','UPDATE','DEACTIVATE','REACTIVATE','MERGE','RENUMBER'
    fieldChanged: text('field_changed'), // column name (null for CREATE)
    oldValue: text('old_value'),
    newValue: text('new_value'),
    changedBy: text('changed_by'), // user ID
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata'),
  },
  (table) => [
    index('idx_gl_acct_changelog_tenant_account').on(table.tenantId, table.accountId),
    index('idx_gl_acct_changelog_tenant_date').on(table.tenantId, table.changedAt),
  ],
);

// ── gl_coa_import_logs (migration 0138) ──────────────────────────
// Tracks CSV COA import history.
export const glCoaImportLogs = pgTable(
  'gl_coa_import_logs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    fileName: text('file_name').notNull(),
    totalRows: integer('total_rows').notNull().default(0),
    successRows: integer('success_rows').notNull().default(0),
    errorRows: integer('error_rows').notNull().default(0),
    errors: jsonb('errors'),
    status: text('status').notNull().default('pending'), // 'pending','validating','validated','importing','complete','failed'
    importedBy: text('imported_by'), // user ID
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // Added in migration 0160 — intelligent import extensions
    rawContent: text('raw_content'),
    fileFormat: text('file_format').default('csv'),
    analysisConfidence: integer('analysis_confidence'),
  },
  (table) => [
    index('idx_gl_coa_import_logs_tenant').on(table.tenantId),
    index('idx_gl_coa_import_logs_tenant_status').on(table.tenantId, table.status),
  ],
);

// ── coa_import_sessions (migration 0160) ─────────────────────────
// Multi-step wizard state persistence for intelligent COA import.
// Lifecycle: uploaded → analyzed → mapping_review → previewed → importing → complete | failed
export const coaImportSessions = pgTable(
  'coa_import_sessions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),

    // File info
    fileName: text('file_name').notNull(),
    fileFormat: text('file_format').notNull().default('csv'),
    fileSizeBytes: integer('file_size_bytes'),

    // Status lifecycle
    status: text('status').notNull().default('uploaded'),

    // Analysis results (JSONB) — column mappings, hierarchy detection, overall confidence
    analysisResult: jsonb('analysis_result'),

    // User-adjusted column mappings (JSONB) — overrides from the mapping review step
    customMappings: jsonb('custom_mappings'),

    // User-selected hierarchy strategy
    hierarchyStrategy: text('hierarchy_strategy'),

    // Account previews with inferred types (JSONB)
    previewAccounts: jsonb('preview_accounts'),

    // Validation summary (JSONB)
    validationResult: jsonb('validation_result'),

    // Import execution results
    importLogId: text('import_log_id').references(() => glCoaImportLogs.id),
    accountsCreated: integer('accounts_created').default(0),
    accountsSkipped: integer('accounts_skipped').default(0),
    headersCreated: integer('headers_created').default(0),
    errorsCount: integer('errors_count').default(0),

    // Options
    stateName: text('state_name'),
    mergeMode: text('merge_mode').default('fresh'),

    // Row-level overrides from user (JSONB) — { rowNumber: { accountType, parentAccountNumber, ... } }
    rowOverrides: jsonb('row_overrides'),

    // Rows to skip (JSONB array of row numbers)
    skipRows: jsonb('skip_rows'),

    // Metadata
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Auto-cleanup stale sessions after 7 days
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_coa_import_sessions_tenant').on(table.tenantId),
    index('idx_coa_import_sessions_status').on(table.tenantId, table.status),
  ],
);
