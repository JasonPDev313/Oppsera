import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';
import { terminals } from './terminals';
import { drawerSessions } from './drawer-sessions';

// ── retail_close_batches ─────────────────────────────────────────
// One close batch per terminal per business date.
// Holds Z-report summary data and GL posting lifecycle.
export const retailCloseBatches = pgTable(
  'retail_close_batches',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    terminalId: text('terminal_id')
      .notNull()
      .references(() => terminals.id),
    businessDate: date('business_date').notNull(),
    drawerSessionId: text('drawer_session_id').references(() => drawerSessions.id),
    status: text('status').notNull().default('open'),

    // Summary data
    grossSalesCents: integer('gross_sales_cents').notNull().default(0),
    netSalesCents: integer('net_sales_cents').notNull().default(0),
    taxCollectedCents: integer('tax_collected_cents').notNull().default(0),
    discountTotalCents: integer('discount_total_cents').notNull().default(0),
    voidTotalCents: integer('void_total_cents').notNull().default(0),
    voidCount: integer('void_count').notNull().default(0),
    serviceChargeCents: integer('service_charge_cents').notNull().default(0),
    tipsCreditCents: integer('tips_credit_cents').notNull().default(0),
    tipsCashCents: integer('tips_cash_cents').notNull().default(0),
    orderCount: integer('order_count').notNull().default(0),
    refundTotalCents: integer('refund_total_cents').notNull().default(0),
    refundCount: integer('refund_count').notNull().default(0),

    // Payment & category breakdowns
    tenderBreakdown: jsonb('tender_breakdown').notNull().default([]),
    salesByDepartment: jsonb('sales_by_department'),
    taxByGroup: jsonb('tax_by_group'),

    // Cash accountability
    cashExpectedCents: integer('cash_expected_cents').notNull().default(0),
    cashCountedCents: integer('cash_counted_cents'),
    cashOverShortCents: integer('cash_over_short_cents'),

    // Lifecycle
    startedAt: timestamp('started_at', { withTimezone: true }),
    startedBy: text('started_by'),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    reconciledBy: text('reconciled_by'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: text('posted_by'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),

    glJournalEntryId: text('gl_journal_entry_id'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_retail_close_terminal_date').on(
      table.tenantId,
      table.terminalId,
      table.businessDate,
    ),
    index('idx_retail_close_location_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
  ],
);
