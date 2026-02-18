import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Custom Payment Types ────────────────────────────────────────
export const customPaymentTypes = pgTable(
  'custom_payment_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    debitChartOfAccountId: text('debit_chart_of_account_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_custom_payment_types_tenant_name').on(table.tenantId, table.name),
  ],
);

// ── Location Payment Types ──────────────────────────────────────
export const locationPaymentTypes = pgTable(
  'location_payment_types',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id'),
    terminalLocationId: text('terminal_location_id'),
    terminalId: text('terminal_id'),
    identifier: text('identifier').notNull(),
    title: text('title').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    customPaymentTypeId: text('custom_payment_type_id').references(() => customPaymentTypes.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_location_payment_types_tenant_location').on(table.tenantId, table.locationId),
  ],
);

// ── Inter-Club Payment Methods ──────────────────────────────────
export const interClubPaymentMethods = pgTable(
  'inter_club_payment_methods',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    paymentMethodId: text('payment_method_id').notNull(),
    reconciliationId: text('reconciliation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_inter_club_payment_methods_tenant_payment').on(
      table.tenantId,
      table.paymentMethodId,
    ),
  ],
);

// ── Inter-Club Reconciliations ──────────────────────────────────
export const interClubReconciliations = pgTable(
  'inter_club_reconciliations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    payToLocationId: text('pay_to_location_id').notNull(),
    orderId: text('order_id'),
    voucherId: text('voucher_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    amountCents: integer('amount_cents').notNull(),
    batchId: text('batch_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_inter_club_reconciliations_tenant_location').on(
      table.tenantId,
      table.payToLocationId,
    ),
  ],
);

// ── Inter-Club Reconciliation Batches ───────────────────────────
export const interClubReconciliationBatches = pgTable(
  'inter_club_reconciliation_batches',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    payToLocationId: text('pay_to_location_id').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    settlementAmountCents: integer('settlement_amount_cents').notNull(),
    settlementStatus: text('settlement_status').notNull().default('pending'),
    settlementDate: date('settlement_date'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_inter_club_reconciliation_batches_tenant_location').on(
      table.tenantId,
      table.payToLocationId,
    ),
  ],
);

// ── Tender Signatures ───────────────────────────────────────────
export const tenderSignatures = pgTable(
  'tender_signatures',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tenderId: text('tender_id').notNull(),
    orderId: text('order_id'),
    signatureData: text('signature_data').notNull(),
    signatureType: text('signature_type').notNull().default('digital'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tender_signatures_tenant_tender').on(table.tenantId, table.tenderId),
  ],
);

// ── Cash Payouts ────────────────────────────────────────────────
export const cashPayouts = pgTable(
  'cash_payouts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminalId: text('terminal_id'),
    courseId: text('course_id'),
    recipientFirstName: text('recipient_first_name'),
    recipientLastName: text('recipient_last_name'),
    amountCents: integer('amount_cents').notNull(),
    notes: text('notes'),
    validityStatus: text('validity_status').notNull().default('valid'),
    payoutType: text('payout_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_cash_payouts_tenant_terminal').on(table.tenantId, table.terminalId),
  ],
);

// ── Cash Tips ───────────────────────────────────────────────────
export const cashTips = pgTable(
  'cash_tips',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    employeeId: text('employee_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_cash_tips_tenant_employee').on(table.tenantId, table.employeeId),
  ],
);

// ── Credit Card Convenience Fees ────────────────────────────────
export const creditCardConvenienceFees = pgTable(
  'credit_card_convenience_fees',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tenderId: text('tender_id').notNull(),
    orderLineId: text('order_line_id'),
    amountChargedOnCents: integer('amount_charged_on_cents').notNull(),
    percentage: numeric('percentage', { precision: 5, scale: 2 }).notNull(),
    feeAmountCents: integer('fee_amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_credit_card_convenience_fees_tenant_tender').on(table.tenantId, table.tenderId),
  ],
);

// ── Event Gratuities ────────────────────────────────────────────
export const eventGratuities = pgTable(
  'event_gratuities',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    orderLineId: text('order_line_id'),
    subtotalCents: integer('subtotal_cents').notNull(),
    percentage: numeric('percentage', { precision: 5, scale: 2 }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_event_gratuities_tenant_event').on(table.tenantId, table.eventId),
  ],
);
