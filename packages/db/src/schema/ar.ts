import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  numeric,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── ar_invoices ────────────────────────────────────────────────
export const arInvoices = pgTable(
  'ar_invoices',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    billingAccountId: text('billing_account_id'),
    invoiceNumber: text('invoice_number').notNull(),
    invoiceDate: date('invoice_date').notNull(),
    dueDate: date('due_date').notNull(),
    status: text('status').notNull().default('draft'), // draft, posted, partial, paid, voided
    memo: text('memo'),
    locationId: text('location_id'),
    currency: text('currency').notNull().default('USD'),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
    balanceDue: numeric('balance_due', { precision: 12, scale: 2 }).notNull(),
    glJournalEntryId: text('gl_journal_entry_id'),
    sourceType: text('source_type').notNull(), // manual, membership, event, pos_house_account
    sourceReferenceId: text('source_reference_id'),
    createdBy: text('created_by').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_ar_invoices_tenant_number').on(table.tenantId, table.invoiceNumber),
    index('idx_ar_invoices_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_ar_invoices_tenant_status').on(table.tenantId, table.status),
    index('idx_ar_invoices_tenant_due_date').on(table.tenantId, table.dueDate),
  ],
);

// ── ar_invoice_lines ───────────────────────────────────────────
export const arInvoiceLines = pgTable(
  'ar_invoice_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => arInvoices.id),
    accountId: text('account_id').notNull(), // revenue GL account
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 4 }).notNull().default('1'),
    unitPrice: numeric('unit_price', { precision: 12, scale: 4 }).notNull().default('0'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    taxGroupId: text('tax_group_id'),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('idx_ar_invoice_lines_invoice').on(table.invoiceId),
  ],
);

// ── ar_receipts ────────────────────────────────────────────────
export const arReceipts = pgTable(
  'ar_receipts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    receiptDate: date('receipt_date').notNull(),
    paymentMethod: text('payment_method'),
    referenceNumber: text('reference_number'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('draft'), // draft, posted, voided
    glJournalEntryId: text('gl_journal_entry_id'),
    bankAccountId: text('bank_account_id'),
    sourceType: text('source_type').notNull(), // manual, pos_tender, online_payment
    sourceReferenceId: text('source_reference_id'),
    createdBy: text('created_by').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ar_receipts_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_ar_receipts_tenant_status').on(table.tenantId, table.status),
  ],
);

// ── ar_receipt_allocations ─────────────────────────────────────
export const arReceiptAllocations = pgTable(
  'ar_receipt_allocations',
  {
    receiptId: text('receipt_id')
      .notNull()
      .references(() => arReceipts.id),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => arInvoices.id),
    amountApplied: numeric('amount_applied', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.receiptId, table.invoiceId] }),
    index('idx_ar_receipt_alloc_receipt').on(table.receiptId),
    index('idx_ar_receipt_alloc_invoice').on(table.invoiceId),
  ],
);
