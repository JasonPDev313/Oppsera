import { z } from 'zod';

export const purchaseVoucherSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  voucherTypeId: z.string().min(1),
  amountCents: z.number().int().min(1),
  voucherNumber: z.string().min(1).max(50).optional(),
  customerId: z.string().optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  orderId: z.string().optional(),
  paymentMethod: z.enum(['cash', 'check', 'card']).default('cash'),
  businessDate: z.string().date(),
});
export type PurchaseVoucherInput = z.input<typeof purchaseVoucherSchema>;

export const redeemVoucherSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  voucherId: z.string().min(1),
  amountCents: z.number().int().min(1),
  orderId: z.string().optional(),
  tenderId: z.string().optional(),
  businessDate: z.string().date(),
});
export type RedeemVoucherInput = z.input<typeof redeemVoucherSchema>;

export const expireVouchersSchema = z.object({
  businessDate: z.string().date(),
  batchSize: z.number().int().min(1).max(1000).default(100),
});
export type ExpireVouchersInput = z.input<typeof expireVouchersSchema>;
