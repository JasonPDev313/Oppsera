import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── rm_modifier_item_sales ────────────────────────────────────────
// Modifier × Item × Day granular read model.
// Updated by order.placed.v1 and order.voided.v1 event consumers.
export const rmModifierItemSales = pgTable(
  'rm_modifier_item_sales',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    businessDate: text('business_date').notNull(),
    modifierId: text('modifier_id').notNull(),
    modifierGroupId: text('modifier_group_id').notNull(),
    catalogItemId: text('catalog_item_id').notNull(),
    modifierName: text('modifier_name'),
    groupName: text('group_name'),
    catalogItemName: text('catalog_item_name'),
    timesSelected: integer('times_selected').notNull().default(0),
    revenueDollars: numeric('revenue_dollars', { precision: 19, scale: 4 }).notNull().default('0'),
    extraRevenueDollars: numeric('extra_revenue_dollars', { precision: 19, scale: 4 }).notNull().default('0'),
    instructionNone: integer('instruction_none').notNull().default(0),
    instructionExtra: integer('instruction_extra').notNull().default(0),
    instructionOnSide: integer('instruction_on_side').notNull().default(0),
    instructionDefault: integer('instruction_default').notNull().default(0),
    voidCount: integer('void_count').notNull().default(0),
    voidRevenueDollars: numeric('void_revenue_dollars', { precision: 19, scale: 4 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_mod_item_sales_key').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
      table.modifierId,
      table.catalogItemId,
    ),
    index('idx_rm_mod_item_sales_date').on(table.tenantId, table.businessDate),
    index('idx_rm_mod_item_sales_group').on(table.tenantId, table.modifierGroupId),
  ],
);

// ── rm_modifier_daypart ───────────────────────────────────────────
// Modifier × Daypart × Day (no item dimension, for daypart heatmap).
// Updated by order.placed.v1 event consumers.
export const rmModifierDaypart = pgTable(
  'rm_modifier_daypart',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    businessDate: text('business_date').notNull(),
    modifierId: text('modifier_id').notNull(),
    modifierGroupId: text('modifier_group_id').notNull(),
    daypart: text('daypart').notNull(),
    modifierName: text('modifier_name'),
    groupName: text('group_name'),
    timesSelected: integer('times_selected').notNull().default(0),
    revenueDollars: numeric('revenue_dollars', { precision: 19, scale: 4 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_mod_daypart_key').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
      table.modifierId,
      table.daypart,
    ),
    index('idx_rm_mod_daypart_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_modifier_group_attach ──────────────────────────────────────
// Group-level attach rate tracking (denominator = eligible lines).
// Updated by order.placed.v1 and order.voided.v1 event consumers.
export const rmModifierGroupAttach = pgTable(
  'rm_modifier_group_attach',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    businessDate: text('business_date').notNull(),
    modifierGroupId: text('modifier_group_id').notNull(),
    groupName: text('group_name'),
    isRequired: boolean('is_required').notNull().default(false),
    eligibleLineCount: integer('eligible_line_count').notNull().default(0),
    linesWithSelection: integer('lines_with_selection').notNull().default(0),
    totalModifierSelections: integer('total_modifier_selections').notNull().default(0),
    uniqueModifiersSelected: integer('unique_modifiers_selected').notNull().default(0),
    revenueImpactDollars: numeric('revenue_impact_dollars', { precision: 19, scale: 4 }).notNull().default('0'),
    voidCount: integer('void_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_mod_group_attach_key').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
      table.modifierGroupId,
    ),
    index('idx_rm_mod_group_attach_date').on(table.tenantId, table.businessDate),
  ],
);
