import {
  pgTable,
  text,
  boolean,
  timestamp,
  numeric,
  integer,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── Tax Categories (DEPRECATED) ─────────────────────────────────
// Superseded by the tax_rates + tax_groups system (Session 9.5).
// Kept for migration continuity; catalog_items.taxCategoryId FK still references this.
// Do not use for new features — use taxRates/taxGroups from catalog-taxes.ts instead.
export const taxCategories = pgTable(
  'tax_categories',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    rate: numeric('rate', { precision: 6, scale: 4 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_tax_categories_tenant_name').on(table.tenantId, table.name),
    index('idx_tax_categories_tenant').on(table.tenantId),
  ],
);

// ── Catalog Categories ──────────────────────────────────────────
export const catalogCategories = pgTable(
  'catalog_categories',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_catalog_categories_tenant').on(table.tenantId),
    index('idx_catalog_categories_parent').on(table.tenantId, table.parentId),
  ],
);

// ── Catalog Items ───────────────────────────────────────────────
export const catalogItems = pgTable(
  'catalog_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    categoryId: text('category_id').references(() => catalogCategories.id),
    sku: text('sku'),
    barcode: text('barcode'),
    name: text('name').notNull(),
    description: text('description'),
    itemType: text('item_type').notNull().default('retail'),
    defaultPrice: numeric('default_price', { precision: 10, scale: 2 }).notNull(),
    cost: numeric('cost', { precision: 10, scale: 2 }),
    taxCategoryId: text('tax_category_id').references(() => taxCategories.id),
    isTrackable: boolean('is_trackable').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  (table) => [
    uniqueIndex('uq_catalog_items_tenant_sku')
      .on(table.tenantId, table.sku)
      .where(sql`sku IS NOT NULL`),
    uniqueIndex('uq_catalog_items_tenant_barcode')
      .on(table.tenantId, table.barcode)
      .where(sql`barcode IS NOT NULL`),
    index('idx_catalog_items_active').on(table.tenantId, table.isActive),
    index('idx_catalog_items_category').on(table.tenantId, table.categoryId),
  ],
);

// ── Modifier Groups ─────────────────────────────────────────────
export const catalogModifierGroups = pgTable(
  'catalog_modifier_groups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
    selectionType: text('selection_type').notNull().default('single'),
    isRequired: boolean('is_required').notNull().default(false),
    minSelections: integer('min_selections').notNull().default(0),
    maxSelections: integer('max_selections'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_catalog_modifier_groups_tenant').on(table.tenantId)],
);

// ── Modifiers ───────────────────────────────────────────────────
export const catalogModifiers = pgTable(
  'catalog_modifiers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    modifierGroupId: text('modifier_group_id')
      .notNull()
      .references(() => catalogModifierGroups.id),
    name: text('name').notNull(),
    priceAdjustment: numeric('price_adjustment', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_catalog_modifiers_group').on(table.modifierGroupId)],
);

// ── Item ↔ Modifier Group Junction ─────────────────────────────
export const catalogItemModifierGroups = pgTable(
  'catalog_item_modifier_groups',
  {
    catalogItemId: text('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    modifierGroupId: text('modifier_group_id')
      .notNull()
      .references(() => catalogModifierGroups.id, { onDelete: 'cascade' }),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.catalogItemId, table.modifierGroupId] })],
);

// ── Location Price Overrides ────────────────────────────────────
export const catalogLocationPrices = pgTable(
  'catalog_location_prices',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    catalogItemId: text('catalog_item_id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_catalog_location_prices_item_loc').on(
      table.catalogItemId,
      table.locationId,
    ),
    index('idx_catalog_location_prices_tenant_item').on(
      table.tenantId,
      table.catalogItemId,
    ),
  ],
);
