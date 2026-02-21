import {
  pgTable,
  text,
  boolean,
  timestamp,
  numeric,
  integer,
  date,
  index,
  uniqueIndex,
  primaryKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';

// ── Orders ──────────────────────────────────────────────────────
export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    orderNumber: text('order_number').notNull(),
    status: text('status').notNull().default('open'),
    source: text('source').notNull().default('pos'),
    version: integer('version').notNull().default(1),
    customerId: text('customer_id'),
    subtotal: integer('subtotal').notNull().default(0),
    taxTotal: integer('tax_total').notNull().default(0),
    serviceChargeTotal: integer('service_charge_total').notNull().default(0),
    discountTotal: integer('discount_total').notNull().default(0),
    roundingAdjustment: integer('rounding_adjustment').notNull().default(0),
    total: integer('total').notNull().default(0),
    taxExempt: boolean('tax_exempt').notNull().default(false),
    taxExemptReason: text('tax_exempt_reason'),
    notes: text('notes'),
    metadata: jsonb('metadata'),
    businessDate: date('business_date').notNull(),
    terminalId: text('terminal_id'),
    employeeId: text('employee_id'),
    shiftId: text('shift_id'),
    receiptSnapshot: jsonb('receipt_snapshot'),
    placedAt: timestamp('placed_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    voidedBy: text('voided_by'),
    heldAt: timestamp('held_at', { withTimezone: true }),
    heldBy: text('held_by'),

    // ── Order gap fields (migration 0034) ──
    holeNumber: integer('hole_number'),
    tabName: text('tab_name'),
    tableNumber: text('table_number'),
    serviceChargeExempt: boolean('service_charge_exempt').notNull().default(false),
    primaryOrderId: text('primary_order_id'),
    promoCodeId: text('promo_code_id'),
    searchTags: text('search_tags'),
    eventId: text('event_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (table) => [
    uniqueIndex('uq_orders_tenant_location_number').on(
      table.tenantId,
      table.locationId,
      table.orderNumber,
    ),
    index('idx_orders_tenant_location_status').on(
      table.tenantId,
      table.locationId,
      table.status,
    ),
    index('idx_orders_tenant_location_created').on(
      table.tenantId,
      table.locationId,
      table.createdAt,
    ),
    index('idx_orders_tenant_location_business_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
    index('idx_orders_tenant_customer')
      .on(table.tenantId, table.customerId)
      .where(sql`customer_id IS NOT NULL`),
    index('idx_orders_tenant_employee')
      .on(table.tenantId, table.employeeId)
      .where(sql`employee_id IS NOT NULL`),
  ],
);

// ── Order Lines ─────────────────────────────────────────────────
export const orderLines = pgTable(
  'order_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    sortOrder: integer('sort_order').notNull().default(0),
    catalogItemId: text('catalog_item_id').notNull(),
    catalogItemName: text('catalog_item_name').notNull(),
    catalogItemSku: text('catalog_item_sku'),
    itemType: text('item_type').notNull(),
    qty: numeric('qty', { precision: 10, scale: 4 }).notNull().default('1'),
    unitPrice: integer('unit_price').notNull(),
    originalUnitPrice: integer('original_unit_price'),
    priceOverrideReason: text('price_override_reason'),
    priceOverriddenBy: text('price_overridden_by'),
    lineSubtotal: integer('line_subtotal').notNull(),
    lineTax: integer('line_tax').notNull().default(0),
    lineTotal: integer('line_total').notNull(),
    taxCalculationMode: text('tax_calculation_mode'),
    modifiers: jsonb('modifiers'),
    specialInstructions: text('special_instructions'),
    selectedOptions: jsonb('selected_options'),
    packageComponents: jsonb('package_components'),
    notes: text('notes'),

    // ── GL mapping snapshots (migration 0084) ──
    subDepartmentId: text('sub_department_id'),
    taxGroupId: text('tax_group_id'),

    // ── Order line gap fields (migration 0034) ──
    costPrice: integer('cost_price'),
    seatNumber: integer('seat_number'),
    mealCourseId: text('meal_course_id'),
    comboParentLineId: text('combo_parent_line_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_order_lines_tenant_order_sort').on(table.tenantId, table.orderId, table.sortOrder),
    index('idx_order_lines_tenant_item').on(table.tenantId, table.catalogItemId),
  ],
);

// ── Order Charges ───────────────────────────────────────────────
export const orderCharges = pgTable(
  'order_charges',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    chargeType: text('charge_type').notNull(),
    name: text('name').notNull(),
    calculationType: text('calculation_type').notNull(),
    value: integer('value').notNull(),
    amount: integer('amount').notNull(),
    isTaxable: boolean('is_taxable').notNull().default(false),
    taxAmount: integer('tax_amount').notNull().default(0),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_order_charges_tenant_order').on(table.tenantId, table.orderId)],
);

// ── Order Discounts ─────────────────────────────────────────────
export const orderDiscounts = pgTable(
  'order_discounts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    type: text('type').notNull(),
    value: integer('value').notNull(),
    amount: integer('amount').notNull(),
    reason: text('reason'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_order_discounts_tenant_order').on(table.tenantId, table.orderId)],
);

// ── Order Counters ──────────────────────────────────────────────
export const orderCounters = pgTable(
  'order_counters',
  {
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    lastNumber: integer('last_number').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.locationId] })],
);

// ── Idempotency Keys ────────────────────────────────────────────
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    clientRequestId: text('client_request_id').notNull(),
    commandName: text('command_name').notNull(),
    resultPayload: jsonb('result_payload').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_idempotency_keys_tenant_request').on(
      table.tenantId,
      table.clientRequestId,
    ),
    index('idx_idempotency_keys_expires').on(table.expiresAt),
  ],
);
