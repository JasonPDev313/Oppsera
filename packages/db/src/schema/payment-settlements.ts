import {
  pgTable,
  text,
  date,
  numeric,
  integer,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { bankAccounts } from './accounting-mappings';

// ── Payment Settlements ─────────────────────────────────────────────
// Tracks card processor settlement batches.
export const paymentSettlements = pgTable(
  'payment_settlements',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id'),
    settlementDate: date('settlement_date').notNull(),
    processorName: text('processor_name').notNull(),
    processorBatchId: text('processor_batch_id'),
    grossAmount: numeric('gross_amount', { precision: 12, scale: 2 }).notNull(),
    feeAmount: numeric('fee_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    netAmount: numeric('net_amount', { precision: 12, scale: 2 }).notNull(),
    chargebackAmount: numeric('chargeback_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    status: text('status').notNull().default('pending'), // pending | matched | posted | disputed
    bankAccountId: text('bank_account_id').references(() => bankAccounts.id),
    glJournalEntryId: text('gl_journal_entry_id'),
    importSource: text('import_source').notNull().default('manual'), // csv | webhook | manual
    rawData: jsonb('raw_data'),
    businessDateFrom: date('business_date_from'),
    businessDateTo: date('business_date_to'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_settlements_tenant_processor_batch').on(
      table.tenantId,
      table.processorName,
      table.processorBatchId,
    ),
    index('idx_payment_settlements_tenant_status').on(table.tenantId, table.status),
    index('idx_payment_settlements_tenant_date').on(table.tenantId, table.settlementDate),
    index('idx_payment_settlements_tenant_processor').on(table.tenantId, table.processorName),
  ],
);

// ── Payment Settlement Lines ────────────────────────────────────────
// Individual settlement line items, matchable to tenders.
export const paymentSettlementLines = pgTable(
  'payment_settlement_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    settlementId: text('settlement_id')
      .notNull()
      .references(() => paymentSettlements.id),
    tenderId: text('tender_id'),
    originalAmountCents: integer('original_amount_cents').notNull(),
    settledAmountCents: integer('settled_amount_cents').notNull(),
    feeCents: integer('fee_cents').notNull().default(0),
    netCents: integer('net_cents').notNull(),
    status: text('status').notNull().default('unmatched'), // matched | unmatched | disputed
    matchedAt: timestamp('matched_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_settlement_lines_settlement').on(table.settlementId),
    index('idx_settlement_lines_tender').on(table.tenderId),
    index('idx_settlement_lines_tenant_status').on(table.tenantId, table.status),
  ],
);
