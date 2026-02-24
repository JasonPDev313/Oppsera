import {
  pgTable,
  text,
  boolean,
  integer,
  numeric,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';
import { terminalLocations } from './terminals';

// ── POS Quick Menu Configs ────────────────────────────────────────
export const posQuickMenuConfigs = pgTable(
  'pos_quick_menu_configs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    profitCenterId: text('profit_center_id').references(() => terminalLocations.id),
    name: text('name').notNull().default('Default'),
    pages: jsonb('pages').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pos_quick_menu_tenant').on(table.tenantId),
  ],
);

// ── POS Tip Settings ──────────────────────────────────────────────
export const posTipSettings = pgTable(
  'pos_tip_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    profitCenterId: text('profit_center_id').references(() => terminalLocations.id),
    enabled: boolean('enabled').notNull().default(false),
    percentageOptions: jsonb('percentage_options').notNull().default([15, 18, 20, 25]),
    dollarAmounts: jsonb('dollar_amounts').notNull().default([]),
    calculateBeforeTax: boolean('calculate_before_tax').notNull().default(true),
    defaultSelectionIndex: integer('default_selection_index'),
    autoGratuityPartySize: integer('auto_gratuity_party_size'),
    autoGratuityPercentage: numeric('auto_gratuity_percentage', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_pos_tip_settings_tenant_pc').on(table.tenantId, table.profitCenterId),
  ],
);
