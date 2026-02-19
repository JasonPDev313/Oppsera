import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  numeric,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';

import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';
import { inventoryItems } from './inventory';
import { vendors, itemVendors } from './receiving';

// ── Purchase Orders ─────────────────────────────────────────────
// Full lifecycle: DRAFT → SUBMITTED → SENT → PARTIALLY_RECEIVED → CLOSED → CANCELED
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    vendorId: text('vendor_id')
      .notNull()
      .references(() => vendors.id),
    poNumber: text('po_number').notNull(),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    // 'draft', 'submitted', 'sent', 'partially_received', 'closed', 'canceled'

    expectedDeliveryDate: date('expected_delivery_date'),
    shippingMethod: text('shipping_method'),
    paymentTerms: text('payment_terms'),
    notes: text('notes'),

    // Totals (NUMERIC 12,4 in dollars)
    subtotal: numeric('subtotal', { precision: 12, scale: 4 }).notNull().default('0'),
    shippingCost: numeric('shipping_cost', { precision: 12, scale: 4 }).notNull().default('0'),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 4 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 4 }).notNull().default('0'),

    // Lifecycle timestamps
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedBy: text('submitted_by'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    sentBy: text('sent_by'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: text('closed_by'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    canceledBy: text('canceled_by'),
    cancelReason: text('cancel_reason'),

    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_purchase_orders_tenant_number').on(table.tenantId, table.poNumber),
    index('idx_purchase_orders_tenant_status').on(table.tenantId, table.status),
    index('idx_purchase_orders_tenant_vendor').on(table.tenantId, table.vendorId),
    index('idx_purchase_orders_tenant_location').on(table.tenantId, table.locationId),
  ],
);

// ── Purchase Order Lines ────────────────────────────────────────
export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id),
    vendorItemId: text('vendor_item_id')
      .references(() => itemVendors.id),

    qtyOrdered: numeric('qty_ordered', { precision: 12, scale: 4 }).notNull(),
    uomCode: text('uom_code').notNull(), // UOM as entered (e.g. 'CS')
    qtyOrderedBase: numeric('qty_ordered_base', { precision: 12, scale: 4 }).notNull().default('0'),
    // base-unit equivalent (e.g. 1 CS * 24 = 24 EA)
    qtyReceived: numeric('qty_received', { precision: 12, scale: 4 }).notNull().default('0'),
    // running total of received base-unit qty across all posted receipts

    unitCost: numeric('unit_cost', { precision: 12, scale: 4 }).notNull(),
    extendedCost: numeric('extended_cost', { precision: 12, scale: 4 }).notNull().default('0'),

    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_purchase_order_lines_tenant_po').on(table.tenantId, table.purchaseOrderId),
    index('idx_purchase_order_lines_tenant_item').on(table.tenantId, table.inventoryItemId),
  ],
);

// ── Purchase Order Revisions ────────────────────────────────────
// Snapshot history created whenever a SUBMITTED/SENT PO is edited (Rule PO-3).
// Stores a full frozen copy of the PO header + lines at the time of edit.
export const purchaseOrderRevisions = pgTable(
  'purchase_order_revisions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    purchaseOrderId: text('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    revisionNumber: integer('revision_number').notNull(),
    snapshot: jsonb('snapshot').notNull(), // { header: {...}, lines: [...] }
    reason: text('reason'),

    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_po_revisions_tenant_po_rev').on(
      table.tenantId,
      table.purchaseOrderId,
      table.revisionNumber,
    ),
    index('idx_po_revisions_tenant_po').on(table.tenantId, table.purchaseOrderId),
  ],
);
