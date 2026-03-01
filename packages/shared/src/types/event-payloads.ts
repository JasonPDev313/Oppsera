import { z } from 'zod';

// ── Shared sub-schemas ──────────────────────────────────────────

const ModifierPayloadSchema = z.object({
  modifierId: z.string(),
  modifierGroupId: z.string().nullable(),
  name: z.string(),
  priceAdjustmentCents: z.number(),
  instruction: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

const AssignedModifierGroupSchema = z.object({
  modifierGroupId: z.string(),
  groupName: z.string().nullable(),
  isRequired: z.boolean(),
});

// ── order.placed.v1 ─────────────────────────────────────────────

export const OrderPlacedPayloadSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  locationId: z.string(),
  businessDate: z.string(),
  subtotal: z.number(), // cents
  taxTotal: z.number(), // cents
  discountTotal: z.number().default(0), // cents
  serviceChargeTotal: z.number().default(0), // cents
  total: z.number(), // cents
  lineCount: z.number(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable().optional(),
  billingAccountId: z.string().nullable().optional(),
  tabName: z.string().nullable().optional(),
  tableNumber: z.string().nullable().optional(),
  employeeId: z.string(),
  employeeName: z.string().nullable().optional(),
  lines: z.array(
    z.object({
      catalogItemId: z.string(),
      catalogItemName: z.string().optional(),
      categoryName: z.string().nullable().optional(),
      qty: z.number(),
      unitPrice: z.number(), // cents
      lineSubtotal: z.number().optional(), // cents
      lineTax: z.number().optional(), // cents
      lineTotal: z.number().optional(), // cents
      packageComponents: z.unknown().nullable().optional(),
      modifiers: z.array(ModifierPayloadSchema).optional().default([]),
      assignedModifierGroupIds: z.array(AssignedModifierGroupSchema).optional().default([]),
    }),
  ),
});

export type OrderPlacedPayload = z.infer<typeof OrderPlacedPayloadSchema>;

// ── order.voided.v1 ─────────────────────────────────────────────

export const OrderVoidedPayloadSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  reason: z.string(),
  voidedBy: z.string(),
  locationId: z.string(),
  businessDate: z.string(),
  total: z.number(), // cents
  customerId: z.string().nullable(),
  lines: z.array(
    z.object({
      catalogItemId: z.string(),
      qty: z.number(),
      modifiers: z
        .array(
          z.object({
            modifierId: z.string(),
            modifierGroupId: z.string().nullable(),
            name: z.string(),
            priceAdjustmentCents: z.number(),
          }),
        )
        .optional()
        .default([]),
    }),
  ),
});

export type OrderVoidedPayload = z.infer<typeof OrderVoidedPayloadSchema>;

// ── order.returned.v1 ───────────────────────────────────────────

export const OrderReturnedPayloadSchema = z.object({
  returnOrderId: z.string(),
  originalOrderId: z.string(),
  returnType: z.enum(['full', 'partial']),
  locationId: z.string(),
  businessDate: z.string(),
  customerId: z.string().nullable(),
  returnTotal: z.number(), // cents, positive value
  lines: z.array(
    z.object({
      catalogItemId: z.string(),
      catalogItemName: z.string().optional(),
      qty: z.number(),
      returnedSubtotal: z.number(), // cents, positive
      returnedTax: z.number(), // cents, positive
      returnedTotal: z.number(), // cents, positive
      subDepartmentId: z.string().nullable().optional(),
      packageComponents: z.unknown().nullable().optional(),
    }),
  ),
});

export type OrderReturnedPayload = z.infer<typeof OrderReturnedPayloadSchema>;

// ── tender.recorded.v1 ──────────────────────────────────────────

export const TenderRecordedPayloadSchema = z.object({
  tenderId: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  locationId: z.string(),
  businessDate: z.string(),
  tenderType: z.string(),
  paymentMethod: z.string(), // alias for tenderType (backward compat)
  tenderSequence: z.number(),
  amount: z.number(), // cents
  tipAmount: z.number(), // cents
  changeGiven: z.number(), // cents
  amountGiven: z.number(), // cents
  employeeId: z.string(),
  terminalId: z.string(),
  shiftId: z.string().nullable(),
  posMode: z.string().nullable().optional(),
  source: z.string().default('pos'),
  orderTotal: z.number(), // cents
  subtotal: z.number(), // cents
  taxTotal: z.number(), // cents
  discountTotal: z.number(), // cents
  serviceChargeTotal: z.number(), // cents
  totalTendered: z.number(), // cents
  remainingBalance: z.number(), // cents
  isFullyPaid: z.boolean(),
  customerId: z.string().nullable(),
  billingAccountId: z.string().nullable().optional(),
  surchargeAmountCents: z.number().default(0),
  lines: z.array(
    z.object({
      catalogItemId: z.string(),
      catalogItemName: z.string().optional(),
      subDepartmentId: z.string().nullable().optional(),
      qty: z.number(),
      extendedPriceCents: z.number(), // cents
      taxGroupId: z.string().nullable().optional(),
      taxAmountCents: z.number().default(0), // cents
      costCents: z.number().nullable().optional(), // cents
      packageComponents: z.unknown().nullable().optional(),
    }),
  ),
  discountBreakdown: z
    .array(
      z.object({
        classification: z.string(),
        amountCents: z.number(),
      }),
    )
    .optional(),
  priceOverrideLossCents: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type TenderRecordedPayload = z.infer<typeof TenderRecordedPayloadSchema>;

// ── tender.reversed.v1 ──────────────────────────────────────────

export const TenderReversedPayloadSchema = z.object({
  reversalId: z.string(),
  originalTenderId: z.string(),
  orderId: z.string(),
  amount: z.number(), // cents
  reason: z.string(),
  reversalType: z.string(),
  refundMethod: z.string(),
});

export type TenderReversedPayload = z.infer<typeof TenderReversedPayloadSchema>;

// ── catalog.item.created.v1 ─────────────────────────────────────

export const CatalogItemCreatedPayloadSchema = z.object({
  itemId: z.string(),
  sku: z.string().nullable(),
  name: z.string(),
  itemType: z.string(),
  defaultPrice: z.number(), // dollars
  cost: z.number().nullable(), // dollars
  categoryId: z.string().nullable(),
  taxCategoryId: z.string().nullable(),
  isTrackable: z.boolean(),
});

export type CatalogItemCreatedPayload = z.infer<typeof CatalogItemCreatedPayloadSchema>;

// ── inventory.movement.created.v1 ───────────────────────────────

export const InventoryMovementCreatedPayloadSchema = z.object({
  inventoryItemId: z.string(),
  catalogItemId: z.string(),
  locationId: z.string(),
  quantity: z.number(),
  unitCost: z.number().nullable(), // dollars
  movementId: z.string(),
  source: z.string(),
});

export type InventoryMovementCreatedPayload = z.infer<typeof InventoryMovementCreatedPayloadSchema>;

// ── inventory.receipt.posted.v1 ─────────────────────────────────

export const InventoryReceiptPostedPayloadSchema = z.object({
  receiptId: z.string(),
  receiptNumber: z.string(),
  vendorId: z.string(),
  locationId: z.string(),
  freightMode: z.enum(['allocate', 'expense']),
  lineCount: z.number(),
  subtotal: z.number(), // dollars
  shippingCost: z.number(), // dollars
  taxAmount: z.number(), // dollars
  total: z.number(), // dollars
});

export type InventoryReceiptPostedPayload = z.infer<typeof InventoryReceiptPostedPayloadSchema>;

// ── inventory.receipt.voided.v1 ─────────────────────────────────

export const InventoryReceiptVoidedPayloadSchema = z.object({
  receiptId: z.string(),
  receiptNumber: z.string(),
  vendorId: z.string(),
  locationId: z.string(),
  lineCount: z.number(),
  reason: z.string(),
});

export type InventoryReceiptVoidedPayload = z.infer<typeof InventoryReceiptVoidedPayloadSchema>;

// ── Event type → payload type mapping ───────────────────────────

export const EVENT_PAYLOAD_SCHEMAS = {
  'order.placed.v1': OrderPlacedPayloadSchema,
  'order.voided.v1': OrderVoidedPayloadSchema,
  'order.returned.v1': OrderReturnedPayloadSchema,
  'tender.recorded.v1': TenderRecordedPayloadSchema,
  'tender.reversed.v1': TenderReversedPayloadSchema,
  'catalog.item.created.v1': CatalogItemCreatedPayloadSchema,
  'inventory.movement.created.v1': InventoryMovementCreatedPayloadSchema,
  'inventory.receipt.posted.v1': InventoryReceiptPostedPayloadSchema,
  'inventory.receipt.voided.v1': InventoryReceiptVoidedPayloadSchema,
} as const;

export type EventPayloadMap = {
  'order.placed.v1': OrderPlacedPayload;
  'order.voided.v1': OrderVoidedPayload;
  'order.returned.v1': OrderReturnedPayload;
  'tender.recorded.v1': TenderRecordedPayload;
  'tender.reversed.v1': TenderReversedPayload;
  'catalog.item.created.v1': CatalogItemCreatedPayload;
  'inventory.movement.created.v1': InventoryMovementCreatedPayload;
  'inventory.receipt.posted.v1': InventoryReceiptPostedPayload;
  'inventory.receipt.voided.v1': InventoryReceiptVoidedPayload;
};
