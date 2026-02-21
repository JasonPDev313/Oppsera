import {
  pgTable,
  text,
  boolean,
  timestamp,
  date,
  integer,
  numeric,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';
import { inventoryItems } from './inventory';

// ── Vendors ─────────────────────────────────────────────────────
export const vendors = pgTable(
  'vendors',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(), // LOWER(TRIM(name)) — set by server, unique per tenant (Rule VM-2)
    accountNumber: text('account_number'),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    paymentTerms: text('payment_terms'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country'),
    taxId: text('tax_id'),
    notes: text('notes'),
    website: text('website'),
    defaultPaymentTerms: text('default_payment_terms'),
    isActive: boolean('is_active').notNull().default(true),
    // AP extension columns (Session 30)
    vendorNumber: text('vendor_number'),
    defaultExpenseAccountId: text('default_expense_account_id'), // FK to gl_accounts — added in migration
    defaultAPAccountId: text('default_ap_account_id'), // FK to gl_accounts — added in migration
    paymentTermsId: text('payment_terms_id'), // FK to payment_terms — added in migration (avoids circular import)
    is1099Eligible: boolean('is_1099_eligible').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_vendors_tenant_name').on(table.tenantId, table.name),
    uniqueIndex('uq_vendors_tenant_account_number')
      .on(table.tenantId, table.accountNumber)
      .where(sql`account_number IS NOT NULL`),
    uniqueIndex('uq_vendors_tenant_name_normalized').on(table.tenantId, table.nameNormalized),
    index('idx_vendors_tenant_active').on(table.tenantId, table.isActive),
  ],
);

// ── Units of Measure ────────────────────────────────────────────
export const uoms = pgTable(
  'uoms',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    code: text('code').notNull(), // EA, CS, DZ, BX, LB, etc.
    name: text('name').notNull(), // Each, Case, Dozen, Box, Pound
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_uoms_tenant_code').on(table.tenantId, table.code),
  ],
);

// ── Item UOM Conversions ────────────────────────────────────────
// Defines how a pack/purchase UOM converts to the base UOM for a specific item.
// e.g., 1 CS (fromUom) = 24 EA (toUom) → conversionFactor = 24
export const itemUomConversions = pgTable(
  'item_uom_conversions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id),
    fromUomId: text('from_uom_id')
      .notNull()
      .references(() => uoms.id),
    toUomId: text('to_uom_id')
      .notNull()
      .references(() => uoms.id),
    conversionFactor: numeric('conversion_factor', { precision: 12, scale: 4 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_item_uom_conversions_tenant_item_from').on(
      table.tenantId,
      table.inventoryItemId,
      table.fromUomId,
    ),
  ],
);

// ── Item Vendors ────────────────────────────────────────────────
// Links an inventory item to a vendor with vendor-specific cost and SKU.
export const itemVendors = pgTable(
  'item_vendors',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id),
    vendorId: text('vendor_id')
      .notNull()
      .references(() => vendors.id),
    vendorSku: text('vendor_sku'),
    vendorCost: numeric('vendor_cost', { precision: 12, scale: 4 }),
    leadTimeDays: integer('lead_time_days'),
    isPreferred: boolean('is_preferred').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true), // soft-delete (Rule VM-3)
    lastCost: numeric('last_cost', { precision: 12, scale: 4 }), // updated after receipt posting (Rule VM-4)
    lastReceivedAt: timestamp('last_received_at', { withTimezone: true }), // updated after receipt posting
    minOrderQty: numeric('min_order_qty', { precision: 12, scale: 4 }),
    packSize: text('pack_size'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_item_vendors_tenant_item_vendor').on(
      table.tenantId,
      table.inventoryItemId,
      table.vendorId,
    ),
    index('idx_item_vendors_tenant_vendor').on(table.tenantId, table.vendorId),
    index('idx_item_vendors_tenant_vendor_active').on(table.tenantId, table.vendorId, table.isActive),
    index('idx_item_vendors_tenant_item_active').on(table.tenantId, table.inventoryItemId, table.isActive),
  ],
);

// ── Item Identifiers ────────────────────────────────────────────
// Barcode/UPC/EAN/PLU/vendor SKU lookups for quick receiving scans.
export const itemIdentifiers = pgTable(
  'item_identifiers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id),
    identifierType: text('identifier_type').notNull(), // 'barcode', 'upc', 'ean', 'plu', 'vendor_sku', 'custom'
    value: text('value').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_item_identifiers_tenant_type_value').on(
      table.tenantId,
      table.identifierType,
      table.value,
    ),
    index('idx_item_identifiers_tenant_value').on(table.tenantId, table.value),
    index('idx_item_identifiers_tenant_item').on(table.tenantId, table.inventoryItemId),
  ],
);

// ── Receiving Receipts ──────────────────────────────────────────
// Header for a multi-line inventory receipt (draft → posted → voided).
export const receivingReceipts = pgTable(
  'receiving_receipts',
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
    receiptNumber: text('receipt_number').notNull(),
    status: text('status').notNull().default('draft'), // 'draft', 'posted', 'voided'
    vendorInvoiceNumber: text('vendor_invoice_number'),
    receivedDate: date('received_date').notNull(),
    freightMode: text('freight_mode').notNull().default('allocate'), // 'expense' | 'allocate'
    shippingCost: numeric('shipping_cost', { precision: 12, scale: 4 }).notNull().default('0'),
    shippingAllocationMethod: text('shipping_allocation_method').notNull().default('by_cost'), // 'by_cost', 'by_qty', 'by_weight', 'by_volume', 'manual', 'none'
    taxAmount: numeric('tax_amount', { precision: 12, scale: 4 }).notNull().default('0'),
    subtotal: numeric('subtotal', { precision: 12, scale: 4 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 4 }).notNull().default('0'),
    notes: text('notes'),
    purchaseOrderId: text('purchase_order_id'), // FK to purchase_orders — constraint added via migration (avoids circular import)
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: text('posted_by'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: text('voided_by'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_receiving_receipts_tenant_number').on(table.tenantId, table.receiptNumber),
    index('idx_receiving_receipts_tenant_status').on(table.tenantId, table.status),
    index('idx_receiving_receipts_tenant_vendor').on(table.tenantId, table.vendorId),
    index('idx_receiving_receipts_tenant_location').on(table.tenantId, table.locationId),
    index('idx_receiving_receipts_tenant_created').on(table.tenantId, table.createdAt),
  ],
);

// ── Receiving Receipt Lines ─────────────────────────────────────
// Individual line items on a receipt.
export const receivingReceiptLines = pgTable(
  'receiving_receipt_lines',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    receiptId: text('receipt_id')
      .notNull()
      .references(() => receivingReceipts.id, { onDelete: 'cascade' }),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id),
    vendorItemId: text('vendor_item_id')
      .references(() => itemVendors.id),
    quantityReceived: numeric('quantity_received', { precision: 12, scale: 4 }).notNull(),
    uomCode: text('uom_code').notNull(), // the UOM the user entered, e.g. 'CS'
    unitCost: numeric('unit_cost', { precision: 12, scale: 4 }).notNull(),
    extendedCost: numeric('extended_cost', { precision: 12, scale: 4 }).notNull().default('0'),
    allocatedShipping: numeric('allocated_shipping', { precision: 12, scale: 4 }).notNull().default('0'),
    landedCost: numeric('landed_cost', { precision: 12, scale: 4 }).notNull().default('0'),
    landedUnitCost: numeric('landed_unit_cost', { precision: 12, scale: 4 }).notNull().default('0'),
    baseQty: numeric('base_qty', { precision: 12, scale: 4 }).notNull().default('0'),
    weight: numeric('weight', { precision: 12, scale: 4 }),
    volume: numeric('volume', { precision: 12, scale: 4 }),
    lotNumber: text('lot_number'),
    serialNumbers: jsonb('serial_numbers'), // text[]
    expirationDate: date('expiration_date'),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
    purchaseOrderId: text('purchase_order_id'),
    purchaseOrderLineId: text('purchase_order_line_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_receiving_receipt_lines_tenant_receipt').on(table.tenantId, table.receiptId),
    index('idx_receiving_receipt_lines_tenant_item').on(table.tenantId, table.inventoryItemId),
  ],
);

// ── Receipt Charges ─────────────────────────────────────────────
// Individual freight/shipping charge line items per receipt.
// EXPENSE mode: each charge has a gl_account_code for GL posting.
// ALLOCATE mode: sum of charges is allocated across receipt lines.
export const receiptCharges = pgTable(
  'receipt_charges',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    receiptId: text('receipt_id')
      .notNull()
      .references(() => receivingReceipts.id, { onDelete: 'cascade' }),
    chargeType: text('charge_type').notNull().default('shipping'), // 'shipping', 'freight', 'handling', 'other'
    description: text('description'),
    amount: numeric('amount', { precision: 12, scale: 4 }).notNull().default('0'),
    glAccountCode: text('gl_account_code'),
    glAccountName: text('gl_account_name'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_receipt_charges_receipt').on(table.receiptId),
    index('idx_receipt_charges_tenant').on(table.tenantId),
  ],
);
