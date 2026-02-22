import { z } from 'zod';

// ── Comp Order Line ─────────────────────────────────────────────
export const compOrderLineSchema = z.object({
  orderId: z.string().min(1),
  orderLineId: z.string().min(1),
  reason: z.string().min(1).max(500),
  compCategory: z.enum(['manager', 'promo', 'quality', 'other']).default('manager'),
  approvedBy: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type CompOrderLineInput = z.input<typeof compOrderLineSchema>;

// ── Comp Full Order ─────────────────────────────────────────────
export const compFullOrderSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(1).max(500),
  compCategory: z.enum(['manager', 'promo', 'quality', 'other']).default('manager'),
  approvedBy: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type CompFullOrderInput = z.input<typeof compFullOrderSchema>;

// ── Void Order Line ─────────────────────────────────────────────
export const voidOrderLineSchema = z.object({
  orderId: z.string().min(1),
  orderLineId: z.string().min(1),
  reason: z.string().min(1).max(500),
  approvedBy: z.string().min(1),
  wasteTracking: z.boolean().default(false),
  locationId: z.string().min(1),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type VoidOrderLineInput = z.input<typeof voidOrderLineSchema>;
