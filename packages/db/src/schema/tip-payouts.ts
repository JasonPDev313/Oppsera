import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { drawerSessions } from './drawer-sessions';

// ── Tip Payouts ──────────────────────────────────────────────────────
// Tracks tip payout events — cash, payroll, or check.
export const tipPayouts = pgTable(
  'tip_payouts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id').notNull(),
    employeeId: text('employee_id').notNull(),
    payoutType: text('payout_type').notNull(), // 'cash' | 'payroll' | 'check'
    amountCents: integer('amount_cents').notNull(),
    businessDate: date('business_date').notNull(),
    drawerSessionId: text('drawer_session_id').references(() => drawerSessions.id),
    payrollPeriod: text('payroll_period'),
    status: text('status').notNull().default('pending'), // 'pending' | 'completed' | 'voided'
    approvedBy: text('approved_by'),
    glJournalEntryId: text('gl_journal_entry_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tip_payouts_tenant_employee').on(table.tenantId, table.employeeId),
    index('idx_tip_payouts_tenant_date').on(table.tenantId, table.businessDate),
    index('idx_tip_payouts_tenant_status').on(table.tenantId, table.status),
    index('idx_tip_payouts_session').on(table.drawerSessionId),
  ],
);
