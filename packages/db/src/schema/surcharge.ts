import {
  pgTable,
  text,
  boolean,
  numeric,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';
import { terminals } from './terminals';
import { paymentProviders } from './payment-gateway';

// ── Surcharge Settings ───────────────────────────────────────────
export const surchargeSettings = pgTable(
  'surcharge_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    providerId: text('provider_id')
      .notNull()
      .references(() => paymentProviders.id),
    locationId: text('location_id').references(() => locations.id), // NULL = tenant-wide default
    terminalId: text('terminal_id').references(() => terminals.id), // NULL = location/tenant scope
    isEnabled: boolean('is_enabled').notNull().default(false),
    surchargeRate: numeric('surcharge_rate', { precision: 5, scale: 4 }).notNull().default('0'),
    maxSurchargeRate: numeric('max_surcharge_rate', { precision: 5, scale: 4 }).notNull().default('0.0400'),
    applyToCreditOnly: boolean('apply_to_credit_only').notNull().default(true),
    exemptDebit: boolean('exempt_debit').notNull().default(true),
    exemptPrepaid: boolean('exempt_prepaid').notNull().default(true),
    customerDisclosureText: text('customer_disclosure_text')
      .default('A surcharge of {rate}% will be applied to credit card transactions.'),
    receiptDisclosureText: text('receipt_disclosure_text')
      .default('Credit Card Surcharge: ${amount}'),
    prohibitedStates: text('prohibited_states')
      .array()
      .default(['CT', 'ME', 'MA', 'OK', 'PR']),
    glAccountId: text('gl_account_id'), // FK to gl_accounts enforced at app level
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_surcharge_settings_tenant').on(table.tenantId),
    index('idx_surcharge_settings_tenant_provider').on(table.tenantId, table.providerId),
    // Partial unique indexes are defined in the migration SQL
    // (Drizzle doesn't support WHERE clauses on unique indexes)
  ],
);
