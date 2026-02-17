import { z } from 'zod';

const idempotencyMixin = {
  clientRequestId: z.string().min(1).max(128).optional(),
};

export const openOrderSchema = z.object({
  ...idempotencyMixin,
  source: z.enum(['pos', 'online', 'admin', 'kiosk', 'mobile', 'api']).default('pos'),
  notes: z.string().max(2000).optional(),
  customerId: z.string().min(1).optional(),
  businessDate: z.string().date().optional(),
  terminalId: z.string().min(1).optional(),
  employeeId: z.string().min(1).optional(),
  shiftId: z.string().min(1).optional(),
});
export type OpenOrderInput = z.input<typeof openOrderSchema>;

export const addLineItemSchema = z.object({
  ...idempotencyMixin,
  catalogItemId: z.string().min(1),
  qty: z.number().positive(),
  modifiers: z.array(z.object({
    modifierId: z.string().min(1),
    name: z.string().min(1),
    priceAdjustment: z.number().int(),
    isDefault: z.boolean().default(false),
  })).optional(),
  specialInstructions: z.string().max(500).optional(),
  selectedOptions: z.record(z.string(), z.string()).optional(),
  priceOverride: z.object({
    unitPrice: z.number().int().nonnegative(),
    reason: z.enum(['manager_discount', 'price_match', 'comp', 'custom']),
    approvedBy: z.string().min(1),
  }).optional(),
  notes: z.string().max(500).optional(),
});
export type AddLineItemInput = z.input<typeof addLineItemSchema>;

export const removeLineItemSchema = z.object({
  ...idempotencyMixin,
  lineItemId: z.string().min(1),
});
export type RemoveLineItemInput = z.infer<typeof removeLineItemSchema>;

export const addServiceChargeSchema = z.object({
  ...idempotencyMixin,
  chargeType: z.enum(['service_charge', 'auto_gratuity', 'venue_fee', 'booking_fee', 'delivery_fee', 'other']),
  name: z.string().min(1).max(100),
  calculationType: z.enum(['percentage', 'fixed']),
  value: z.number().int().positive(),
  isTaxable: z.boolean().default(false),
});
export type AddServiceChargeInput = z.input<typeof addServiceChargeSchema>;

export const removeServiceChargeSchema = z.object({
  ...idempotencyMixin,
  chargeId: z.string().min(1),
});
export type RemoveServiceChargeInput = z.infer<typeof removeServiceChargeSchema>;

export const applyDiscountSchema = z.object({
  ...idempotencyMixin,
  type: z.enum(['percentage', 'fixed']),
  value: z.number().positive(),
  reason: z.string().max(500).optional(),
});
export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>;

export const placeOrderSchema = z.object({
  ...idempotencyMixin,
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const updateOrderSchema = z.object({
  ...idempotencyMixin,
  customerId: z.string().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export const voidOrderSchema = z.object({
  ...idempotencyMixin,
  reason: z.string().min(1).max(500),
});
export type VoidOrderInput = z.infer<typeof voidOrderSchema>;

export const cloneOrderSchema = z.object({
  ...idempotencyMixin,
});
export type CloneOrderInput = z.infer<typeof cloneOrderSchema>;

export const reopenOrderSchema = z.object({
  ...idempotencyMixin,
});
export type ReopenOrderInput = z.infer<typeof reopenOrderSchema>;

export const deleteOrderSchema = z.object({
  ...idempotencyMixin,
});
export type DeleteOrderInput = z.infer<typeof deleteOrderSchema>;

export const holdOrderSchema = z.object({
  ...idempotencyMixin,
});
export type HoldOrderInput = z.infer<typeof holdOrderSchema>;

export const recallOrderSchema = z.object({
  ...idempotencyMixin,
});
export type RecallOrderInput = z.infer<typeof recallOrderSchema>;
