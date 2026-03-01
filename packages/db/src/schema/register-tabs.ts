import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Register Tabs ────────────────────────────────────────────────

export const registerTabs = pgTable(
  'register_tabs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminalId: text('terminal_id').notNull(),
    tabNumber: integer('tab_number').notNull(),
    orderId: text('order_id'),
    label: text('label'),
    employeeId: text('employee_id'),
    employeeName: text('employee_name'),
    // ── PMS integration (migration 0246) ───────────────────────
    folioId: text('folio_id'),
    guestName: text('guest_name'),
    // ── Sync foundation (migration 0244) ────────────────────────
    version: integer('version').notNull().default(1),
    locationId: text('location_id'),
    status: text('status').notNull().default('active'),
    deviceId: text('device_id'),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow(),
    metadata: jsonb('metadata').default({}),
    // ─────────────────────────────────────────────────────────────
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_register_tabs_terminal_tab').on(table.tenantId, table.terminalId, table.tabNumber),
    index('idx_register_tabs_tenant_terminal').on(table.tenantId, table.terminalId),
    index('idx_register_tabs_employee').on(table.tenantId, table.employeeId),
    index('idx_register_tabs_location_updated').on(table.tenantId, table.locationId, table.updatedAt),
    check('chk_register_tabs_status', sql`status IN ('active', 'held', 'closed')`),
  ],
);
