import {
  pgTable,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { terminals } from './terminals';
import { paymentProviders } from './payment-gateway';

// ── Terminal Device Assignments (HSN → POS terminal mapping) ────
export const terminalDeviceAssignments = pgTable(
  'terminal_device_assignments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    terminalId: text('terminal_id')
      .notNull()
      .references(() => terminals.id),
    providerId: text('provider_id')
      .notNull()
      .references(() => paymentProviders.id),
    hsn: text('hsn').notNull(), // Hardware Serial Number
    deviceModel: text('device_model'), // e.g. 'ingenico_ipp350', 'clover_flex3'
    deviceLabel: text('device_label'), // friendly name
    isActive: boolean('is_active').notNull().default(true),
    lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
    lastStatus: text('last_status'), // 'connected', 'disconnected', 'error'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_terminal_devices_tenant').on(table.tenantId),
    index('idx_terminal_devices_tenant_hsn').on(table.tenantId, table.hsn),
    index('idx_terminal_devices_tenant_active').on(table.tenantId, table.isActive),
    uniqueIndex('uq_terminal_devices_tenant_terminal').on(table.tenantId, table.terminalId),
  ],
);
