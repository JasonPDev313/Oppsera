import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── rm_daily_sales ─────────────────────────────────────────────
// Pre-aggregated daily sales by location and business date.
// Updated by order.placed.v1 and order.voided.v1 event consumers.
export const rmDailySales = pgTable(
  'rm_daily_sales',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    businessDate: date('business_date').notNull(),
    orderCount: integer('order_count').notNull().default(0),
    grossSales: numeric('gross_sales', { precision: 19, scale: 4 }).notNull().default('0'),
    discountTotal: numeric('discount_total', { precision: 19, scale: 4 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 19, scale: 4 }).notNull().default('0'),
    netSales: numeric('net_sales', { precision: 19, scale: 4 }).notNull().default('0'),
    tenderCash: numeric('tender_cash', { precision: 19, scale: 4 }).notNull().default('0'),
    tenderCard: numeric('tender_card', { precision: 19, scale: 4 }).notNull().default('0'),
    tenderGiftCard: numeric('tender_gift_card', { precision: 19, scale: 4 }).notNull().default('0'),
    tenderHouseAccount: numeric('tender_house_account', { precision: 19, scale: 4 }).notNull().default('0'),
    tenderAch: numeric('tender_ach', { precision: 19, scale: 4 }).notNull().default('0'),
    tenderOther: numeric('tender_other', { precision: 19, scale: 4 }).notNull().default('0'),
    tipTotal: numeric('tip_total', { precision: 19, scale: 4 }).notNull().default('0'),
    serviceChargeTotal: numeric('service_charge_total', { precision: 19, scale: 4 }).notNull().default('0'),
    surchargeTotal: numeric('surcharge_total', { precision: 19, scale: 4 }).notNull().default('0'),
    returnTotal: numeric('return_total', { precision: 19, scale: 4 }).notNull().default('0'),
    voidCount: integer('void_count').notNull().default(0),
    voidTotal: numeric('void_total', { precision: 19, scale: 4 }).notNull().default('0'),
    avgOrderValue: numeric('avg_order_value', { precision: 19, scale: 4 }).notNull().default('0'),
    // Non-POS revenue columns (migration 0224)
    pmsRevenue: numeric('pms_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    arRevenue: numeric('ar_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    membershipRevenue: numeric('membership_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    voucherRevenue: numeric('voucher_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    totalBusinessRevenue: numeric('total_business_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_daily_sales_tenant_location_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
    index('idx_rm_daily_sales_tenant_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_item_sales ──────────────────────────────────────────────
// Per-item sales aggregation by location and business date.
// Updated by order.placed.v1 and order.voided.v1 event consumers.
export const rmItemSales = pgTable(
  'rm_item_sales',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    businessDate: date('business_date').notNull(),
    catalogItemId: text('catalog_item_id').notNull(),
    catalogItemName: text('catalog_item_name').notNull(),
    categoryName: text('category_name'),
    quantitySold: integer('quantity_sold').notNull().default(0),
    grossRevenue: numeric('gross_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    quantityVoided: integer('quantity_voided').notNull().default(0),
    voidRevenue: numeric('void_revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_item_sales_tenant_loc_date_item').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
      table.catalogItemId,
    ),
    index('idx_rm_item_sales_tenant_date').on(table.tenantId, table.businessDate),
    index('idx_rm_item_sales_tenant_item').on(table.tenantId, table.catalogItemId),
  ],
);

// ── rm_inventory_on_hand ───────────────────────────────────────
// Current inventory snapshot per location.
// Updated by inventory movement events.
export const rmInventoryOnHand = pgTable(
  'rm_inventory_on_hand',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    inventoryItemId: text('inventory_item_id').notNull(),
    itemName: text('item_name').notNull(),
    onHand: integer('on_hand').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(0),
    isBelowThreshold: boolean('is_below_threshold').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_inventory_on_hand_tenant_loc_item').on(
      table.tenantId,
      table.locationId,
      table.inventoryItemId,
    ),
    index('idx_rm_inventory_on_hand_below').on(
      table.tenantId,
      table.locationId,
      table.isBelowThreshold,
    ),
  ],
);

// ── rm_customer_activity ───────────────────────────────────────
// Customer engagement summary (visits, spend, last activity).
// Updated by order.placed.v1 event consumers.
export const rmCustomerActivity = pgTable(
  'rm_customer_activity',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: text('customer_id').notNull(),
    customerName: text('customer_name').notNull(),
    totalVisits: integer('total_visits').notNull().default(0),
    totalSpend: numeric('total_spend', { precision: 19, scale: 4 }).notNull().default('0'),
    lastVisitAt: timestamp('last_visit_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_customer_activity_tenant_customer').on(
      table.tenantId,
      table.customerId,
    ),
    index('idx_rm_customer_activity_last_visit').on(table.tenantId, table.lastVisitAt),
  ],
);

// ── rm_revenue_activity ──────────────────────────────────────
// Per-transaction revenue activity from ALL sources (POS, PMS, AR, membership, voucher).
// Updated by event consumers for each revenue source.
export const rmRevenueActivity = pgTable(
  'rm_revenue_activity',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id').notNull(),
    businessDate: date('business_date').notNull(),
    source: text('source').notNull(), // 'pos_order','pms_folio','ar_invoice','membership','voucher'
    sourceId: text('source_id').notNull(),
    sourceLabel: text('source_label').notNull(),
    customerName: text('customer_name'),
    amountDollars: numeric('amount_dollars', { precision: 19, scale: 4 }).notNull().default('0'),
    status: text('status').notNull().default('completed'), // completed, voided, refunded
    metadata: jsonb('metadata'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_revenue_activity_tenant_source').on(
      table.tenantId,
      table.source,
      table.sourceId,
    ),
    index('idx_rm_revenue_activity_tenant_created').on(table.tenantId, table.createdAt),
    index('idx_rm_revenue_activity_tenant_date').on(table.tenantId, table.businessDate),
    index('idx_rm_revenue_activity_tenant_loc_created').on(
      table.tenantId,
      table.locationId,
      table.createdAt,
    ),
  ],
);

// ── reporting_field_catalog ────────────────────────────────────
// System-owned catalog of available fields for the custom report builder.
// NOT tenant-scoped — shared across all tenants.
export const reportingFieldCatalog = pgTable(
  'reporting_field_catalog',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    dataset: text('dataset').notNull(),  // 'daily_sales', 'item_sales', 'inventory', 'customers'
    fieldKey: text('field_key').notNull(),
    label: text('label').notNull(),
    dataType: text('data_type').notNull(),  // 'number', 'string', 'date', 'boolean'
    aggregation: text('aggregation'),  // 'sum', 'count', 'avg', 'min', 'max', null for dimensions
    isMetric: boolean('is_metric').notNull(),
    isFilturable: boolean('is_filturable').notNull().default(true),
    isSortable: boolean('is_sortable').notNull().default(true),
    columnExpression: text('column_expression').notNull(),
    tableRef: text('table_ref').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_reporting_field_catalog_dataset_key').on(table.dataset, table.fieldKey),
    index('idx_reporting_field_catalog_dataset').on(table.dataset),
  ],
);

// ── report_definitions ─────────────────────────────────────────
// Tenant-scoped saved report configurations for the custom report builder.
export const reportDefinitions = pgTable(
  'report_definitions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    dataset: text('dataset').notNull(),
    definition: jsonb('definition').notNull(),  // { columns, filters, sortBy, groupBy, limit }
    createdBy: text('created_by').notNull(),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_report_definitions_tenant').on(table.tenantId, table.isArchived),
  ],
);

// ── dashboard_definitions ──────────────────────────────────────
// Tenant-scoped dashboard layouts with report tiles.
export const dashboardDefinitions = pgTable(
  'dashboard_definitions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    tiles: jsonb('tiles').notNull(),  // Array of { reportId, title, chartType, position, size }
    isDefault: boolean('is_default').notNull().default(false),
    createdBy: text('created_by').notNull(),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_dashboard_definitions_tenant').on(table.tenantId, table.isArchived),
  ],
);

// ── report_snapshots (V2-ready) ──────────────────────────────
// Pre-computed report results for dashboard tile caching.
// Schema only — no background refresh logic in V1.
export const reportSnapshots = pgTable(
  'report_snapshots',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    reportId: text('report_id').notNull(),
    snapshotData: jsonb('snapshot_data').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('report_snapshots_tenant_report_idx').on(
      t.tenantId,
      t.reportId,
      t.generatedAt,
    ),
  ],
);
