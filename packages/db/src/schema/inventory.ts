import {
  pgTable,
  text,
  boolean,
  timestamp,
  numeric,
  date,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── Inventory Items ─────────────────────────────────────────────
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    catalogItemId: text('catalog_item_id').notNull(), // cross-module, NO DB FK
    sku: text('sku'), // from catalog, denormalized
    name: text('name').notNull(), // denormalized
    itemType: text('item_type').notNull(), // 'food', 'beverage', 'retail', etc.
    status: text('status').notNull().default('active'), // 'active', 'discontinued', 'archived'
    trackInventory: boolean('track_inventory').notNull().default(true),
    baseUnit: text('base_unit').notNull().default('each'),
    purchaseUnit: text('purchase_unit').notNull().default('each'),
    purchaseToBaseRatio: numeric('purchase_to_base_ratio', { precision: 10, scale: 4 })
      .notNull()
      .default('1'),
    costingMethod: text('costing_method').notNull().default('fifo'), // 'fifo', 'weighted_avg', 'standard'
    standardCost: numeric('standard_cost', { precision: 12, scale: 2 }),
    reorderPoint: numeric('reorder_point', { precision: 10, scale: 4 }),
    reorderQuantity: numeric('reorder_quantity', { precision: 10, scale: 4 }),
    parLevel: numeric('par_level', { precision: 10, scale: 4 }),
    allowNegative: boolean('allow_negative').notNull().default(false),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('uq_inventory_items_tenant_location_catalog').on(
      table.tenantId,
      table.locationId,
      table.catalogItemId,
    ),
    index('idx_inventory_items_tenant_location_status').on(
      table.tenantId,
      table.locationId,
      table.status,
    ),
    index('idx_inventory_items_tenant_sku')
      .on(table.tenantId, table.sku)
      .where(sql`sku IS NOT NULL`),
  ],
);

// ── Inventory Movements (append-only — never update or delete) ──
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id),
    movementType: text('movement_type').notNull(), // 'receive', 'sale', 'void_reversal', 'adjustment', 'transfer_in', 'transfer_out', 'shrink', 'waste', 'return', 'initial', 'conversion'
    quantityDelta: numeric('quantity_delta', { precision: 10, scale: 4 }).notNull(), // positive for in, negative for out
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }), // per unit cost at time of movement
    extendedCost: numeric('extended_cost', { precision: 12, scale: 2 }), // total cost = qty * unit_cost, or manual override
    referenceType: text('reference_type'), // 'order', 'transfer', 'purchase_order', 'manual', 'system'
    referenceId: text('reference_id'), // order ID, transfer batch ID, etc.
    reason: text('reason'),
    source: text('source').notNull().default('manual'), // 'pos', 'online', 'manual', 'integration', 'system'
    businessDate: date('business_date').notNull(),
    employeeId: text('employee_id'),
    terminalId: text('terminal_id'),
    batchId: text('batch_id'), // for grouping related movements, e.g., transfer pair
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_inventory_movements_item').on(
      table.tenantId,
      table.inventoryItemId,
      table.createdAt,
    ),
    index('idx_inventory_movements_tenant_location_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
    index('idx_inventory_movements_reference')
      .on(table.tenantId, table.referenceType, table.referenceId)
      .where(sql`reference_type IS NOT NULL`),
    uniqueIndex('uq_inventory_movements_idempotency')
      .on(
        table.tenantId,
        table.referenceType,
        table.referenceId,
        table.inventoryItemId,
        table.movementType,
      )
      .where(sql`reference_type IS NOT NULL`),
  ],
);
