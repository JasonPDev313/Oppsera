import {
  pgTable,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  index,
  uniqueIndex,
  jsonb,
  date,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── expense_policies ────────────────────────────────────────────────────────

export const expensePolicies = pgTable(
  'expense_policies',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),

    autoApproveThreshold: numeric('auto_approve_threshold', { precision: 12, scale: 2 }),
    requiresReceiptAbove: numeric('requires_receipt_above', { precision: 12, scale: 2 }),
    maxAmountPerExpense: numeric('max_amount_per_expense', { precision: 12, scale: 2 }),
    allowedCategories: text('allowed_categories').array(),
    approverRole: text('approver_role').default('manager'),

    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_expense_policies_tenant_name').on(table.tenantId, table.name),
    index('idx_expense_policies_tenant').on(table.tenantId),
  ],
);

// ── expenses ────────────────────────────────────────────────────────────────

export const expenses = pgTable(
  'expenses',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id'),

    expenseNumber: text('expense_number').notNull(),
    employeeUserId: text('employee_user_id').notNull(),
    expensePolicyId: text('expense_policy_id').references(() => expensePolicies.id),

    status: text('status').notNull().default('draft'),
    expenseDate: date('expense_date').notNull(),
    vendorName: text('vendor_name'),
    category: text('category').notNull(),
    description: text('description'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),

    paymentMethod: text('payment_method'),
    isReimbursable: boolean('is_reimbursable').notNull().default(true),

    receiptUrl: text('receipt_url'),
    receiptFileName: text('receipt_file_name'),

    glAccountId: text('gl_account_id'),
    projectId: text('project_id'),
    glJournalEntryId: text('gl_journal_entry_id'),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedBy: text('submitted_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: text('approved_by'),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedBy: text('rejected_by'),
    rejectionReason: text('rejection_reason'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: text('posted_by'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    reimbursedAt: timestamp('reimbursed_at', { withTimezone: true }),
    reimbursementMethod: text('reimbursement_method'),
    reimbursementReference: text('reimbursement_reference'),

    notes: text('notes'),
    metadata: jsonb('metadata').notNull().default({}),
    clientRequestId: text('client_request_id'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_expenses_tenant_number').on(table.tenantId, table.expenseNumber),
    index('idx_expenses_tenant_status').on(table.tenantId, table.status),
    index('idx_expenses_tenant_employee').on(table.tenantId, table.employeeUserId),
    index('idx_expenses_tenant_date').on(table.tenantId, table.expenseDate),
    index('idx_expenses_tenant_category').on(table.tenantId, table.category),
  ],
);

// ── expense_receipts ────────────────────────────────────────────────────────

export const expenseReceipts = pgTable(
  'expense_receipts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    expenseId: text('expense_id')
      .notNull()
      .references(() => expenses.id),

    fileName: text('file_name'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    storageKey: text('storage_key').notNull(),

    uploadedBy: text('uploaded_by'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_expense_receipts_expense').on(table.expenseId),
    index('idx_expense_receipts_tenant').on(table.tenantId),
  ],
);

// ── rm_expense_summary (CQRS read model) ───────────────────────────────────

export const rmExpenseSummary = pgTable(
  'rm_expense_summary',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id'),
    fiscalPeriod: text('fiscal_period').notNull(),
    category: text('category').notNull(),

    expenseCount: integer('expense_count').notNull().default(0),
    totalAmount: numeric('total_amount', { precision: 19, scale: 4 }).notNull().default('0'),
    reimbursedCount: integer('reimbursed_count').notNull().default(0),
    reimbursedAmount: numeric('reimbursed_amount', { precision: 19, scale: 4 }).notNull().default('0'),
    pendingCount: integer('pending_count').notNull().default(0),
    pendingAmount: numeric('pending_amount', { precision: 19, scale: 4 }).notNull().default('0'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_expense_summary').on(
      table.tenantId,
      table.fiscalPeriod,
      table.category,
    ),
    index('idx_rm_expense_summary_tenant').on(table.tenantId),
  ],
);
