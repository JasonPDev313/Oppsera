import {
  pgTable,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { glAccounts } from './accounting';

// ── Payment Terms ───────────────────────────────────────────────
export const paymentTerms = pgTable(
  'payment_terms',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    days: integer('days').notNull(),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    discountDays: integer('discount_days').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_payment_terms_tenant_name').on(table.tenantId, table.name),
    index('idx_payment_terms_tenant_active').on(table.tenantId, table.isActive),
  ],
);

// ── AP Bills ────────────────────────────────────────────────────
export const apBills = pgTable(
  'ap_bills',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    vendorId: text('vendor_id').notNull(), // FK to vendors.id — added in migration to avoid circular import
    billNumber: text('bill_number').notNull(),
    billDate: text('bill_date').notNull(), // YYYY-MM-DD
    dueDate: text('due_date').notNull(), // YYYY-MM-DD
    status: text('status').notNull().default('draft'), // draft, posted, partial, paid, voided
    memo: text('memo'),
    locationId: text('location_id'),
    paymentTermsId: text('payment_terms_id'), // FK to payment_terms — added in migration
    vendorInvoiceNumber: text('vendor_invoice_number'),
    currency: text('currency').notNull().default('USD'),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
    balanceDue: numeric('balance_due', { precision: 12, scale: 2 }).notNull(),
    glJournalEntryId: text('gl_journal_entry_id'),
    receivingReceiptId: text('receiving_receipt_id'),
    version: integer('version').notNull().default(1),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: text('posted_by'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ap_bills_tenant_status').on(table.tenantId, table.status),
    index('idx_ap_bills_tenant_vendor').on(table.tenantId, table.vendorId),
    index('idx_ap_bills_tenant_due_date').on(table.tenantId, table.dueDate),
    index('idx_ap_bills_tenant_status_due').on(table.tenantId, table.status, table.dueDate),
    uniqueIndex('uq_ap_bills_tenant_vendor_number')
      .on(table.tenantId, table.vendorId, table.billNumber)
      .where(sql`status != 'voided'`),
    check('chk_ap_bills_status', sql`status IN ('draft','posted','partial','paid','voided')`),
    check('chk_ap_bills_total_amount', sql`total_amount >= 0`),
  ],
);

// ── AP Bill Lines ───────────────────────────────────────────────
export const apBillLines = pgTable(
  'ap_bill_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billId: text('bill_id')
      .notNull()
      .references(() => apBills.id),
    lineType: text('line_type').notNull().default('expense'), // expense, inventory, asset, freight
    accountId: text('account_id')
      .notNull()
      .references(() => glAccounts.id),
    description: text('description'),
    quantity: numeric('quantity', { precision: 12, scale: 4 }).notNull().default('1'),
    unitCost: numeric('unit_cost', { precision: 12, scale: 4 }).notNull().default('0'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    locationId: text('location_id'),
    departmentId: text('department_id'),
    inventoryItemId: text('inventory_item_id'),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('idx_ap_bill_lines_bill').on(table.billId),
    check('chk_ap_bill_lines_type', sql`line_type IN ('expense','inventory','asset','freight')`),
    check('chk_ap_bill_lines_amount', sql`amount >= 0`),
  ],
);

// ── AP Payments ─────────────────────────────────────────────────
export const apPayments = pgTable(
  'ap_payments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    vendorId: text('vendor_id').notNull(), // FK to vendors.id — added in migration
    paymentDate: text('payment_date').notNull(), // YYYY-MM-DD
    paymentMethod: text('payment_method'), // check, ach, wire, credit_card, etc.
    bankAccountId: text('bank_account_id'),
    referenceNumber: text('reference_number'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('draft'), // draft, posted, voided
    glJournalEntryId: text('gl_journal_entry_id'),
    memo: text('memo'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ap_payments_tenant_status').on(table.tenantId, table.status),
    index('idx_ap_payments_tenant_vendor').on(table.tenantId, table.vendorId),
    check('chk_ap_payments_status', sql`status IN ('draft','posted','voided')`),
    check('chk_ap_payments_amount', sql`amount >= 0`),
  ],
);

// ── AP Payment Allocations ──────────────────────────────────────
// Links payments to bills. Sum of allocations per bill = bill.amountPaid.
export const apPaymentAllocations = pgTable(
  'ap_payment_allocations',
  {
    paymentId: text('payment_id')
      .notNull()
      .references(() => apPayments.id),
    billId: text('bill_id')
      .notNull()
      .references(() => apBills.id),
    amountApplied: numeric('amount_applied', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.paymentId, table.billId] }),
    check('chk_ap_payment_allocations_amount', sql`amount_applied > 0`),
  ],
);

// ── AP Bill Landed Cost Allocations ──────────────────────────────
// Distributes freight line cost to inventory lines for landed cost calculation
export const apBillLandedCostAllocations = pgTable(
  'ap_bill_landed_cost_allocations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    billId: text('bill_id')
      .notNull()
      .references(() => apBills.id),
    freightLineId: text('freight_line_id')
      .notNull()
      .references(() => apBillLines.id),
    inventoryLineId: text('inventory_line_id')
      .notNull()
      .references(() => apBillLines.id),
    allocatedAmount: numeric('allocated_amount', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ap_bill_lca_bill').on(table.billId),
  ],
);
