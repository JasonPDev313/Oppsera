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

// ── comp_events ─────────────────────────────────────────────────
// Tracks comp events separately from discounts.
// Comp = expense (business eats the cost), NOT contra-revenue.
export const compEvents = pgTable(
  'comp_events',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id').notNull(),
    orderId: text('order_id').notNull(),
    orderLineId: text('order_line_id'),
    compType: text('comp_type').notNull(), // 'item' | 'order'
    amountCents: integer('amount_cents').notNull(),
    reason: text('reason').notNull(),
    compCategory: text('comp_category').notNull().default('manager'), // 'manager' | 'promo' | 'quality' | 'other'
    approvedBy: text('approved_by').notNull(),
    glJournalEntryId: text('gl_journal_entry_id'),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_comp_events_tenant_order').on(table.tenantId, table.orderId),
    index('idx_comp_events_tenant_date').on(table.tenantId, table.businessDate),
  ],
);
