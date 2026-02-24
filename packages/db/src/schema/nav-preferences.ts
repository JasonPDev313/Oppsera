import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './core';

/**
 * Tenant navigation preferences — stores custom sidebar order + visibility.
 * Pattern A: tenant_id is the PRIMARY KEY (1:1 per tenant).
 *
 * item_order is a JSONB array of { href: string, hidden: boolean }.
 * Order in the array = display order in sidebar.
 * When empty or row missing, the default navigation array is used.
 */
export const tenantNavPreferences = pgTable('tenant_nav_preferences', {
  tenantId: text('tenant_id')
    .primaryKey()
    .references(() => tenants.id),
  itemOrder: jsonb('item_order').notNull().default('[]'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
});
