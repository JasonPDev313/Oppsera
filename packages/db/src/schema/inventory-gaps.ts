import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Catalog Combos ──────────────────────────────────────────────
export const catalogCombos = pgTable(
  'catalog_combos',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    catalogItemId: text('catalog_item_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_catalog_combos_tenant_item').on(table.tenantId, table.catalogItemId),
  ],
);

// ── Catalog Combo Items ─────────────────────────────────────────
export const catalogComboItems = pgTable(
  'catalog_combo_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    comboId: text('combo_id')
      .notNull()
      .references(() => catalogCombos.id, { onDelete: 'cascade' }),
    catalogItemId: text('catalog_item_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    priceCents: integer('price_cents'),
    unitPriceCents: integer('unit_price_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_catalog_combo_items_tenant_combo').on(table.tenantId, table.comboId),
  ],
);

// ── Purchase Invoices ───────────────────────────────────────────
export const purchaseInvoices = pgTable(
  'purchase_invoices',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    refName: text('ref_name'),
    vendorId: text('vendor_id'),
    invoiceNumber: text('invoice_number'),
    receiveDate: date('receive_date'),
    invoiceDate: date('invoice_date'),
    poNumber: text('po_number'),
    purchaseOrderId: text('purchase_order_id'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    shippingCostCents: integer('shipping_cost_cents').notNull().default(0),
    otherCostsCents: integer('other_costs_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_purchase_invoices_tenant_vendor')
      .on(table.tenantId, table.vendorId)
      .where(sql`vendor_id IS NOT NULL`),
    index('idx_purchase_invoices_tenant_invoice_number')
      .on(table.tenantId, table.invoiceNumber)
      .where(sql`invoice_number IS NOT NULL`),
  ],
);

// ── Purchase Invoice Items ──────────────────────────────────────
export const purchaseInvoiceItems = pgTable(
  'purchase_invoice_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    purchaseInvoiceId: text('purchase_invoice_id')
      .notNull()
      .references(() => purchaseInvoices.id, { onDelete: 'cascade' }),
    catalogItemId: text('catalog_item_id'),
    vendorItemId: text('vendor_item_id'),
    title: text('title').notNull(),
    inStockQuantity: integer('in_stock_quantity').notNull().default(0),
    purchaseQuantity: integer('purchase_quantity').notNull().default(0),
    unitCostCents: integer('unit_cost_cents').notNull().default(0),
    otherCostCents: integer('other_cost_cents').notNull().default(0),
    shippingCostCents: integer('shipping_cost_cents').notNull().default(0),
    productCostCents: integer('product_cost_cents').notNull().default(0),
    totalCostCents: integer('total_cost_cents').notNull().default(0),
    totalQuantity: integer('total_quantity').notNull().default(0),
    newCostCents: integer('new_cost_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_purchase_invoice_items_tenant_invoice').on(table.tenantId, table.purchaseInvoiceId),
  ],
);
