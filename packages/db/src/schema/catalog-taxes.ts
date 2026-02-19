import {
  pgTable,
  text,
  boolean,
  timestamp,
  numeric,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';
import { catalogItems } from './catalog';

// ── Tax Rates (tenant-scoped, reusable) ─────────────────────────
export const taxRates = pgTable(
  'tax_rates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    rateDecimal: numeric('rate_decimal', { precision: 6, scale: 4 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  (table) => [
    uniqueIndex('uq_tax_rates_tenant_name').on(table.tenantId, table.name),
    index('idx_tax_rates_tenant').on(table.tenantId),
  ],
);

// ── Tax Groups (location-scoped) ────────────────────────────────
export const taxGroups = pgTable(
  'tax_groups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  (table) => [
    uniqueIndex('uq_tax_groups_tenant_location_name').on(
      table.tenantId,
      table.locationId,
      table.name,
    ),
    index('idx_tax_groups_tenant_location').on(table.tenantId, table.locationId),
  ],
);

// ── Tax Group Rates (join table) ────────────────────────────────
export const taxGroupRates = pgTable(
  'tax_group_rates',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    taxGroupId: text('tax_group_id')
      .notNull()
      .references(() => taxGroups.id, { onDelete: 'cascade' }),
    taxRateId: text('tax_rate_id')
      .notNull()
      .references(() => taxRates.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    uniqueIndex('uq_tax_group_rates_group_rate').on(table.taxGroupId, table.taxRateId),
    index('idx_tax_group_rates_group').on(table.taxGroupId),
  ],
);

// ── Catalog Item Location Tax Groups ────────────────────────────
export const catalogItemLocationTaxGroups = pgTable(
  'catalog_item_location_tax_groups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    catalogItemId: text('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    taxGroupId: text('tax_group_id')
      .notNull()
      .references(() => taxGroups.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('uq_item_location_tax_group').on(
      table.locationId,
      table.catalogItemId,
      table.taxGroupId,
    ),
    index('idx_item_location_tax_groups_lookup').on(
      table.tenantId,
      table.locationId,
      table.catalogItemId,
    ),
  ],
);

// ── Order Line Taxes (snapshot — append-only) ───────────────────
export const orderLineTaxes = pgTable(
  'order_line_taxes',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    orderLineId: text('order_line_id').notNull(),
    taxRateId: text('tax_rate_id'),
    taxName: text('tax_name').notNull(),
    rateDecimal: numeric('rate_decimal', { precision: 6, scale: 4 }).notNull(),
    amount: integer('amount').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_order_line_taxes_tenant_line').on(table.tenantId, table.orderLineId),
  ],
);
