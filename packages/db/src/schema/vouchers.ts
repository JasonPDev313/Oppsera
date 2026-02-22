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

// ── Voucher Types ───────────────────────────────────────────────

export const voucherTypes = pgTable(
  'voucher_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    voucherType: text('voucher_type').notNull().default('gift_card'),
    liabilityChartOfAccountId: text('liability_chart_of_account_id'),
    expirationIncomeChartOfAccountId: text('expiration_income_chart_of_account_id'),
    availableOnline: boolean('available_online').notNull().default(false),
    availableForPosSale: boolean('available_for_pos_sale').notNull().default(false),
    availableForPosSaleSpecificRoles: boolean('available_for_pos_sale_specific_roles')
      .notNull()
      .default(false),
    expirationStrategy: jsonb('expiration_strategy'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_voucher_types_tenant_name').on(table.tenantId, table.name)],
);

// ── Vouchers ────────────────────────────────────────────────────

export const vouchers = pgTable(
  'vouchers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    voucherTypeId: text('voucher_type_id').references(() => voucherTypes.id),
    voucherNumber: text('voucher_number').notNull(),
    voucherNumberType: text('voucher_number_type'),
    voucherAmountCents: integer('voucher_amount_cents').notNull(),
    redeemedAmountCents: integer('redeemed_amount_cents').notNull().default(0),
    redemptionStatus: text('redemption_status').notNull().default('unredeemed'),
    validityStartDate: date('validity_start_date'),
    validityEndDate: date('validity_end_date'),
    customerId: text('customer_id'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    notes: text('notes'),
    orderId: text('order_id'),
    refundOrderId: text('refund_order_id'),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_vouchers_tenant_number').on(table.tenantId, table.voucherNumber),
    index('idx_vouchers_tenant_customer').on(table.tenantId, table.customerId),
  ],
);

// ── Voucher Ledger Entries ──────────────────────────────────────

export const voucherLedgerEntries = pgTable(
  'voucher_ledger_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    voucherId: text('voucher_id')
      .notNull()
      .references(() => vouchers.id),
    tenderId: text('tender_id'),
    description: text('description'),
    balanceCents: integer('balance_cents').notNull(),
    amountCents: integer('amount_cents').notNull(),
    glJournalEntryId: text('gl_journal_entry_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_voucher_ledger_entries_tenant_voucher').on(table.tenantId, table.voucherId),
  ],
);

// ── Voucher Department Restrictions ─────────────────────────────

export const voucherDepartmentRestrictions = pgTable(
  'voucher_department_restrictions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    voucherId: text('voucher_id')
      .notNull()
      .references(() => vouchers.id, { onDelete: 'cascade' }),
    departmentId: text('department_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_voucher_dept_restrictions_tenant_voucher_dept').on(
      table.tenantId,
      table.voucherId,
      table.departmentId,
    ),
  ],
);

// ── Voucher Deposits ────────────────────────────────────────────

export const voucherDeposits = pgTable(
  'voucher_deposits',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    voucherId: text('voucher_id')
      .notNull()
      .references(() => vouchers.id),
    orderId: text('order_id'),
    paymentAmountCents: integer('payment_amount_cents').notNull(),
    depositAmountCents: integer('deposit_amount_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    orderLineId: text('order_line_id'),
    tenderId: text('tender_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_voucher_deposits_tenant_voucher').on(table.tenantId, table.voucherId),
  ],
);

// ── Voucher Expiration Income ───────────────────────────────────

export const voucherExpirationIncome = pgTable(
  'voucher_expiration_income',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    voucherId: text('voucher_id')
      .notNull()
      .references(() => vouchers.id),
    voucherNumber: text('voucher_number'),
    expirationDate: date('expiration_date').notNull(),
    expirationAmountCents: integer('expiration_amount_cents').notNull(),
    orderLineId: text('order_line_id'),
    glJournalEntryId: text('gl_journal_entry_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_voucher_expiration_income_tenant_voucher').on(table.tenantId, table.voucherId),
  ],
);

// ── Voucher Type Department Restrictions ─────────────────────────

export const voucherTypeDepartmentRestrictions = pgTable(
  'voucher_type_department_restrictions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    voucherTypeId: text('voucher_type_id')
      .notNull()
      .references(() => voucherTypes.id, { onDelete: 'cascade' }),
    departmentId: text('department_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_voucher_type_dept_restrictions_tenant_type_dept').on(
      table.tenantId,
      table.voucherTypeId,
      table.departmentId,
    ),
  ],
);

// ── Pending Breakage Review ─────────────────────────────────────

export const pendingBreakageReview = pgTable(
  'pending_breakage_review',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    voucherId: text('voucher_id')
      .notNull()
      .references(() => vouchers.id),
    voucherNumber: text('voucher_number').notNull(),
    amountCents: integer('amount_cents').notNull(),
    expiredAt: timestamp('expired_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'declined'
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),
    glJournalEntryId: text('gl_journal_entry_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pending_breakage_tenant_status').on(table.tenantId, table.status),
    index('idx_pending_breakage_tenant_voucher').on(table.tenantId, table.voucherId),
  ],
);

// ── Voucher Type Management Groups ──────────────────────────────

export const voucherTypeManagementGroups = pgTable(
  'voucher_type_management_groups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    voucherTypeId: text('voucher_type_id')
      .notNull()
      .references(() => voucherTypes.id, { onDelete: 'cascade' }),
    managementCompanyId: text('management_company_id'),
    subGroupId: text('sub_group_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_voucher_type_mgmt_groups_tenant_type').on(table.tenantId, table.voucherTypeId),
  ],
);
