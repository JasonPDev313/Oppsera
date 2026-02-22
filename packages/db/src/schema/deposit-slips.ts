import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── deposit_slips ────────────────────────────────────────────────
// Unified deposit model for hybrid locations (retail + F&B).
// One deposit slip per location per business date.
export const depositSlips = pgTable(
  'deposit_slips',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    businessDate: date('business_date').notNull(),
    depositType: text('deposit_type').notNull().default('cash'),
    totalAmountCents: integer('total_amount_cents').notNull().default(0),
    bankAccountId: text('bank_account_id'),
    status: text('status').notNull().default('pending'),
    retailCloseBatchIds: text('retail_close_batch_ids')
      .array()
      .default([]),
    fnbCloseBatchId: text('fnb_close_batch_id'),
    // ACCT-CLOSE-01: deposit prep enhancements
    denominationBreakdown: jsonb('denomination_breakdown'),
    slipNumber: text('slip_number'),
    preparedBy: text('prepared_by'),
    preparedAt: timestamp('prepared_at', { withTimezone: true }),
    depositedAt: timestamp('deposited_at', { withTimezone: true }),
    depositedBy: text('deposited_by'),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    reconciledBy: text('reconciled_by'),
    glJournalEntryId: text('gl_journal_entry_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_deposit_slips_location_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
    index('idx_deposit_slips_status').on(table.tenantId, table.status),
  ],
);
