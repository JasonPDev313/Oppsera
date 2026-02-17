import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_register_tabs_terminal_tab').on(table.tenantId, table.terminalId, table.tabNumber),
    index('idx_register_tabs_tenant_terminal').on(table.tenantId, table.terminalId),
    index('idx_register_tabs_employee').on(table.tenantId, table.employeeId),
  ],
);
