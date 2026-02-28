import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── Transaction Type Registry ─────────────────────────────────────
// System types: tenant_id = NULL, is_system = true
// Tenant custom types: tenant_id = <tenant>, is_system = false
export const glTransactionTypes = pgTable(
  'gl_transaction_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').references(() => tenants.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(), // TransactionTypeCategory
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    defaultDebitAccountType: text('default_debit_account_type'),
    defaultCreditAccountType: text('default_credit_account_type'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_gl_txn_types_system_code').on(table.code).where(
      // @ts-expect-error — raw SQL condition for partial index
      'tenant_id IS NULL',
    ),
    uniqueIndex('uq_gl_txn_types_tenant_code').on(table.tenantId, table.code).where(
      // @ts-expect-error — raw SQL condition for partial index
      'tenant_id IS NOT NULL',
    ),
    index('idx_gl_txn_types_tenant').on(table.tenantId),
    index('idx_gl_txn_types_category').on(table.category, table.sortOrder),
  ],
);

// ── Tenant Tender Types ───────────────────────────────────────────
// Custom/external payment methods defined by each tenant.
export const tenantTenderTypes = pgTable(
  'tenant_tender_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    code: text('code').notNull(),
    category: text('category').notNull().default('other'), // TenderCategory
    postingMode: text('posting_mode').notNull().default('clearing'), // TenderPostingMode
    isActive: boolean('is_active').notNull().default(true),
    requiresReference: boolean('requires_reference').notNull().default(false),
    referenceLabel: text('reference_label'),
    defaultClearingAccountId: text('default_clearing_account_id'), // soft ref to gl_accounts.id
    defaultBankAccountId: text('default_bank_account_id'), // soft ref to gl_accounts.id
    defaultFeeAccountId: text('default_fee_account_id'), // soft ref to gl_accounts.id
    defaultExpenseAccountId: text('default_expense_account_id'), // soft ref to gl_accounts.id
    reportingBucket: text('reporting_bucket').notNull().default('include'), // ReportingBucket
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_tenant_tender_types_code').on(table.tenantId, table.code),
    index('idx_tenant_tender_types_active').on(table.tenantId, table.isActive),
  ],
);

// ── GL Transaction Type Mappings ────────────────────────────────
// Clean Credit/Debit model for all 45 transaction types.
// Tenant-scoped with optional location override.
// For tender types, saves write-through to payment_type_gl_defaults.
export const glTransactionTypeMappings = pgTable(
  'gl_transaction_type_mappings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    transactionTypeCode: text('transaction_type_code').notNull(),
    locationId: text('location_id').references(() => locations.id),
    creditAccountId: text('credit_account_id'), // soft ref to gl_accounts.id
    debitAccountId: text('debit_account_id'), // soft ref to gl_accounts.id
    source: text('source').notNull().default('manual'), // 'manual' | 'backfilled' | 'auto'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_gl_tt_mappings_tenant_code_loc')
      .on(table.tenantId, table.transactionTypeCode)
      .where(sql`location_id IS NULL`),
    uniqueIndex('uq_gl_tt_mappings_tenant_code_loc_specific')
      .on(table.tenantId, table.transactionTypeCode, table.locationId)
      .where(sql`location_id IS NOT NULL`),
    index('idx_gl_tt_mappings_tenant').on(table.tenantId),
    index('idx_gl_tt_mappings_code').on(table.tenantId, table.transactionTypeCode),
  ],
);
