import {
  pgTable,
  text,
  boolean,
  timestamp,
  date,
  numeric,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { glAccounts, glJournalEntries, glJournalLines } from './accounting';

// ── Sub-Department GL Defaults ────────────────────────────────────
// Maps sub-departments to their default GL accounts for revenue, COGS, etc.
export const subDepartmentGlDefaults = pgTable(
  'sub_department_gl_defaults',
  {
    tenantId: text('tenant_id').notNull(),
    subDepartmentId: text('sub_department_id').notNull(),
    revenueAccountId: text('revenue_account_id').references(() => glAccounts.id),
    cogsAccountId: text('cogs_account_id').references(() => glAccounts.id),
    inventoryAssetAccountId: text('inventory_asset_account_id').references(() => glAccounts.id),
    discountAccountId: text('discount_account_id').references(() => glAccounts.id),
    returnsAccountId: text('returns_account_id').references(() => glAccounts.id),
    compAccountId: text('comp_account_id').references(() => glAccounts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.subDepartmentId] }),
  ],
);

// ── Payment Type GL Defaults ──────────────────────────────────────
// Maps payment types to their default GL accounts for cash, clearing, fees.
export const paymentTypeGlDefaults = pgTable(
  'payment_type_gl_defaults',
  {
    tenantId: text('tenant_id').notNull(),
    paymentTypeId: text('payment_type_id').notNull(),
    cashAccountId: text('cash_account_id').references(() => glAccounts.id),
    clearingAccountId: text('clearing_account_id').references(() => glAccounts.id),
    feeExpenseAccountId: text('fee_expense_account_id').references(() => glAccounts.id),
    postingMode: text('posting_mode').notNull().default('clearing'),
    expenseAccountId: text('expense_account_id').references(() => glAccounts.id),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.paymentTypeId] }),
  ],
);

// ── Tax Group GL Defaults ─────────────────────────────────────────
// Maps tax groups to their default GL accounts for tax payable.
export const taxGroupGlDefaults = pgTable(
  'tax_group_gl_defaults',
  {
    tenantId: text('tenant_id').notNull(),
    taxGroupId: text('tax_group_id').notNull(),
    taxPayableAccountId: text('tax_payable_account_id').references(() => glAccounts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.taxGroupId] }),
  ],
);

// ── PMS Folio Entry Type GL Defaults ─────────────────────────────
// Maps PMS folio entry types (ROOM_CHARGE, TAX, FEE, etc.) to GL accounts.
export const pmsFolioEntryTypeGlDefaults = pgTable(
  'pms_folio_entry_type_gl_defaults',
  {
    tenantId: text('tenant_id').notNull(),
    entryType: text('entry_type').notNull(), // ROOM_CHARGE, TAX, FEE, ADJUSTMENT, PAYMENT, REFUND
    accountId: text('account_id')
      .notNull()
      .references(() => glAccounts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.entryType] }),
  ],
);

// ── Discount GL Mappings ───────────────────────────────────────────
// Per sub-department, per discount classification GL account mapping.
// Normalized table avoids adding 11 columns to sub_department_gl_defaults.
export const discountGlMappings = pgTable(
  'discount_gl_mappings',
  {
    tenantId: text('tenant_id').notNull(),
    subDepartmentId: text('sub_department_id').notNull(),
    discountClassification: text('discount_classification').notNull(),
    glAccountId: text('gl_account_id').references(() => glAccounts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.subDepartmentId, table.discountClassification] }),
    index('idx_discount_gl_mappings_tenant').on(table.tenantId),
  ],
);

// ── Bank Accounts ─────────────────────────────────────────────────
// Links physical bank accounts to GL accounts for deposit workflows.
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    glAccountId: text('gl_account_id')
      .notNull()
      .references(() => glAccounts.id),
    accountNumberLast4: text('account_number_last4'),
    bankName: text('bank_name'),
    isActive: boolean('is_active').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    lastReconciledDate: date('last_reconciled_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_bank_accounts_tenant_gl_account').on(table.tenantId, table.glAccountId),
    index('idx_bank_accounts_tenant_active').on(table.tenantId, table.isActive),
  ],
);

// ── Bank Reconciliations ─────────────────────────────────────────
export const bankReconciliations = pgTable(
  'bank_reconciliations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    bankAccountId: text('bank_account_id')
      .notNull()
      .references(() => bankAccounts.id),
    statementDate: date('statement_date').notNull(),
    statementEndingBalance: numeric('statement_ending_balance', { precision: 12, scale: 2 }).notNull(),
    beginningBalance: numeric('beginning_balance', { precision: 12, scale: 2 }).notNull(),
    status: text('status').notNull().default('in_progress'), // 'in_progress' | 'completed'
    clearedBalance: numeric('cleared_balance', { precision: 12, scale: 2 }).notNull().default('0'),
    outstandingDeposits: numeric('outstanding_deposits', { precision: 12, scale: 2 }).notNull().default('0'),
    outstandingWithdrawals: numeric('outstanding_withdrawals', { precision: 12, scale: 2 }).notNull().default('0'),
    adjustmentTotal: numeric('adjustment_total', { precision: 12, scale: 2 }).notNull().default('0'),
    difference: numeric('difference', { precision: 12, scale: 2 }).notNull().default('0'),
    reconciledBy: text('reconciled_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_bank_reconciliations_tenant_acct_date').on(
      table.tenantId,
      table.bankAccountId,
      table.statementDate,
    ),
    index('idx_bank_reconciliations_tenant').on(table.tenantId, table.bankAccountId),
    index('idx_bank_reconciliations_status').on(table.tenantId, table.status),
  ],
);

// ── Bank Reconciliation Items ────────────────────────────────────
export const bankReconciliationItems = pgTable(
  'bank_reconciliation_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    reconciliationId: text('reconciliation_id')
      .notNull()
      .references(() => bankReconciliations.id),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    glJournalLineId: text('gl_journal_line_id').references(() => glJournalLines.id),
    itemType: text('item_type').notNull(), // 'deposit' | 'withdrawal' | 'fee' | 'interest' | 'adjustment'
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    date: date('date').notNull(),
    description: text('description'),
    isCleared: boolean('is_cleared').notNull().default(false),
    clearedDate: date('cleared_date'),
    glJournalEntryId: text('gl_journal_entry_id').references(() => glJournalEntries.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_bank_reconciliation_items_recon').on(table.reconciliationId),
  ],
);
