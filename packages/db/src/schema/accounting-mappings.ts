import {
  pgTable,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { glAccounts } from './accounting';

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_bank_accounts_tenant_gl_account').on(table.tenantId, table.glAccountId),
    index('idx_bank_accounts_tenant_active').on(table.tenantId, table.isActive),
  ],
);
