import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── Tenders (append-only — financial amounts immutable) ─────────
export const tenders = pgTable(
  'tenders',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    orderId: text('order_id').notNull(), // NO DB-level FK — cross-module, enforced in app
    tenderType: text('tender_type').notNull(), // 'cash', 'card', 'gift_card', 'store_credit', 'house_account', 'other'
    tenderSequence: integer('tender_sequence').notNull(),
    amount: integer('amount').notNull(), // cents
    tipAmount: integer('tip_amount').notNull().default(0),
    changeGiven: integer('change_given').notNull().default(0),
    amountGiven: integer('amount_given').notNull().default(0),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('captured'),
    businessDate: date('business_date').notNull(),
    shiftId: text('shift_id'),
    posMode: text('pos_mode'),
    source: text('source').notNull().default('pos'),
    providerRef: text('provider_ref'),
    cardLast4: text('card_last4'),
    cardBrand: text('card_brand'),
    giftCardId: text('gift_card_id'),
    employeeId: text('employee_id').notNull(),
    terminalId: text('terminal_id').notNull(),
    paymentIntentId: text('payment_intent_id'), // FK to payment_intents (app-enforced, avoids circular schema import)
    drawerEventId: text('drawer_event_id'),
    allocationSnapshot: jsonb('allocation_snapshot'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    index('idx_tenders_tenant_order').on(table.tenantId, table.orderId),
    index('idx_tenders_tenant_location_created').on(
      table.tenantId,
      table.locationId,
      table.createdAt,
    ),
    index('idx_tenders_tenant_type_created').on(
      table.tenantId,
      table.tenderType,
      table.createdAt,
    ),
    index('idx_tenders_tenant_location_date_terminal').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
      table.terminalId,
    ),
    uniqueIndex('uq_tenders_tenant_order_sequence').on(
      table.tenantId,
      table.orderId,
      table.tenderSequence,
    ),
  ],
);

// ── Tender Reversals ────────────────────────────────────────────
export const tenderReversals = pgTable(
  'tender_reversals',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    originalTenderId: text('original_tender_id')
      .notNull()
      .references(() => tenders.id),
    orderId: text('order_id').notNull(),
    reversalType: text('reversal_type').notNull(), // 'void', 'refund'
    amount: integer('amount').notNull(), // cents
    reason: text('reason').notNull(),
    refundMethod: text('refund_method'),
    providerRef: text('provider_ref'),
    status: text('status').notNull().default('completed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    index('idx_tender_reversals_tender').on(table.tenantId, table.originalTenderId),
    index('idx_tender_reversals_order').on(table.tenantId, table.orderId),
  ],
);

// ── Payment Journal Entries (append-only GL posting) ────────────
export const paymentJournalEntries = pgTable(
  'payment_journal_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    referenceType: text('reference_type').notNull(), // 'tender', 'reversal'
    referenceId: text('reference_id').notNull(),
    orderId: text('order_id').notNull(),
    entries: jsonb('entries').notNull(), // array of { accountCode, accountName, debit, credit }
    businessDate: date('business_date').notNull(),
    sourceModule: text('source_module').notNull().default('payments'),
    postingStatus: text('posting_status').notNull().default('posted'),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pje_tenant_date').on(table.tenantId, table.businessDate),
    index('idx_pje_tenant_order').on(table.tenantId, table.orderId),
    index('idx_pje_tenant_ref').on(table.tenantId, table.referenceType, table.referenceId),
  ],
);

// ── Chargebacks (Session 47) ──────────────────────────────────
export const chargebacks = pgTable(
  'chargebacks',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id').notNull(),
    tenderId: text('tender_id')
      .notNull()
      .references(() => tenders.id),
    orderId: text('order_id').notNull(),
    chargebackReason: text('chargeback_reason').notNull(),
    chargebackAmountCents: integer('chargeback_amount_cents').notNull(),
    feeAmountCents: integer('fee_amount_cents').notNull().default(0),
    status: text('status').notNull().default('received'), // 'received', 'under_review', 'won', 'lost'
    providerCaseId: text('provider_case_id'),
    providerRef: text('provider_ref'),
    customerId: text('customer_id'),
    resolutionReason: text('resolution_reason'),
    resolutionDate: date('resolution_date'),
    businessDate: date('business_date').notNull(),
    glJournalEntryId: text('gl_journal_entry_id'),
    reversalGlJournalEntryId: text('reversal_gl_journal_entry_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
    resolvedBy: text('resolved_by'),
  },
  (table) => [
    index('idx_chargebacks_tenant_status').on(table.tenantId, table.status),
    index('idx_chargebacks_tenant_tender').on(table.tenantId, table.tenderId),
    index('idx_chargebacks_tenant_order').on(table.tenantId, table.orderId),
    index('idx_chargebacks_tenant_date').on(table.tenantId, table.businessDate),
  ],
);
