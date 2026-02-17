import { z } from 'zod';

export const OrderOpenedDataSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  locationId: z.string(),
  source: z.string(),
  businessDate: z.string(),
});

export const OrderLineAddedDataSchema = z.object({
  orderId: z.string(),
  lineId: z.string(),
  catalogItemId: z.string(),
  catalogItemName: z.string(),
  itemType: z.string(),
  qty: z.number(),
  unitPrice: z.number().int(),
  lineSubtotal: z.number().int(),
  lineTax: z.number().int(),
  lineTotal: z.number().int(),
});

export const OrderLineRemovedDataSchema = z.object({
  orderId: z.string(),
  lineId: z.string(),
  catalogItemId: z.string(),
  catalogItemName: z.string(),
  qty: z.number(),
});

export const OrderServiceChargeAddedDataSchema = z.object({
  orderId: z.string(),
  chargeId: z.string(),
  chargeType: z.string(),
  name: z.string(),
  amount: z.number().int(),
});

export const OrderServiceChargeRemovedDataSchema = z.object({
  orderId: z.string(),
  chargeId: z.string(),
  name: z.string(),
  amount: z.number().int(),
});

export const OrderDiscountAppliedDataSchema = z.object({
  orderId: z.string(),
  discountId: z.string(),
  type: z.string(),
  value: z.number(),
  amount: z.number().int(),
});

export const OrderPlacedDataSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  locationId: z.string(),
  businessDate: z.string(),
  subtotal: z.number().int(),
  taxTotal: z.number().int(),
  total: z.number().int(),
  lineCount: z.number().int(),
});

export const OrderPaidDataSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  total: z.number().int(),
  paidAt: z.string(),
});

export const OrderVoidedDataSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  reason: z.string(),
  voidedBy: z.string(),
});
