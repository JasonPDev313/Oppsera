import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';
import { terminals } from './terminals';

// ── Drawer Sessions ─────────────────────────────────────────────

export const drawerSessions = pgTable(
  'drawer_sessions',
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
    profitCenterId: text('profit_center_id'),
    employeeId: text('employee_id').notNull(),
    businessDate: date('business_date').notNull(),
    status: text('status').notNull().default('open'), // 'open' | 'closed'
    openingBalanceCents: integer('opening_balance_cents').notNull().default(0),
    changeFundCents: integer('change_fund_cents').notNull().default(0),
    closingCountCents: integer('closing_count_cents'),
    expectedCashCents: integer('expected_cash_cents'),
    varianceCents: integer('variance_cents'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: text('closed_by'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_drawer_sessions_tenant_terminal_date').on(
      table.tenantId,
      table.terminalId,
      table.businessDate,
    ),
    index('idx_drawer_sessions_tenant_status').on(table.tenantId, table.status),
    index('idx_drawer_sessions_tenant_location').on(table.tenantId, table.locationId),
    index('idx_drawer_sessions_tenant_terminal').on(table.tenantId, table.terminalId),
    index('idx_drawer_sessions_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── Drawer Session Events (append-only) ─────────────────────────

export const drawerSessionEvents = pgTable(
  'drawer_session_events',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    drawerSessionId: text('drawer_session_id')
      .notNull()
      .references(() => drawerSessions.id),
    eventType: text('event_type').notNull(), // 'paid_in' | 'paid_out' | 'cash_drop' | 'drawer_open' | 'no_sale'
    amountCents: integer('amount_cents').notNull().default(0),
    reason: text('reason'),
    employeeId: text('employee_id').notNull(),
    approvedBy: text('approved_by'),
    // Cash drop enhancements (ACCT-CLOSE-01)
    bagId: text('bag_id'),
    sealNumber: text('seal_number'),
    verifiedBy: text('verified_by'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    depositSlipId: text('deposit_slip_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_drawer_session_events_tenant_session').on(
      table.tenantId,
      table.drawerSessionId,
    ),
    index('idx_drawer_session_events_tenant_type').on(
      table.tenantId,
      table.eventType,
    ),
  ],
);
