import { z } from 'zod';

// EMITTED EVENTS

export const InventoryReceivedDataSchema = z.object({
  inventoryItemId: z.string(),
  catalogItemId: z.string(),
  locationId: z.string(),
  quantity: z.number(),
  unitCost: z.number().nullable(),
  movementId: z.string(),
  source: z.string(),
});

export const InventoryAdjustedDataSchema = z.object({
  inventoryItemId: z.string(),
  catalogItemId: z.string(),
  locationId: z.string(),
  quantityDelta: z.number(),
  reason: z.string(),
  movementId: z.string(),
});

export const InventoryLowStockDataSchema = z.object({
  inventoryItemId: z.string(),
  catalogItemId: z.string(),
  locationId: z.string(),
  itemName: z.string(),
  currentOnHand: z.number(),
  reorderPoint: z.number(),
  reorderQuantity: z.number().nullable(),
});

export const InventoryNegativeDataSchema = z.object({
  inventoryItemId: z.string(),
  catalogItemId: z.string(),
  locationId: z.string(),
  itemName: z.string(),
  currentOnHand: z.number(),
});

// CONSUMED EVENTS

export const OrderPlacedDataSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  locationId: z.string(),
  subtotal: z.number().int(),
  taxTotal: z.number().int(),
  total: z.number().int(),
  lineCount: z.number().int(),
  customerId: z.string().nullable().optional(),
  lines: z.array(z.object({
    catalogItemId: z.string(),
    qty: z.number(),
    packageComponents: z.array(z.object({
      catalogItemId: z.string(),
      name: z.string(),
      qty: z.number(),
    })).nullable().optional(),
  })).optional(),
});

export const OrderVoidedDataSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  reason: z.string(),
  voidedBy: z.string(),
  locationId: z.string().optional(),
  businessDate: z.string().optional(),
  total: z.number().int().optional(),
});

export const CatalogItemCreatedDataSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  itemType: z.string(),
  isActive: z.boolean(),
});

export const CatalogItemArchivedDataSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  sku: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});

export const CatalogItemUnarchivedDataSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  sku: z.string().nullable().optional(),
});
