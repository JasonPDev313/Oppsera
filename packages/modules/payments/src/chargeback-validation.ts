import { z } from 'zod';

export const recordChargebackSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  tenderId: z.string().min(1),
  orderId: z.string().min(1),
  chargebackReason: z.string().min(1).max(500),
  chargebackAmountCents: z.number().int().min(1),
  feeAmountCents: z.number().int().min(0).default(0),
  providerCaseId: z.string().max(200).optional(),
  providerRef: z.string().max(200).optional(),
  customerId: z.string().optional(),
  businessDate: z.string().date(),
});
export type RecordChargebackInput = z.input<typeof recordChargebackSchema>;

export const resolveChargebackSchema = z.object({
  chargebackId: z.string().min(1),
  resolution: z.enum(['won', 'lost']),
  resolutionReason: z.string().min(1).max(500),
  feeAmountCents: z.number().int().min(0).optional(), // override fee on resolution
});
export type ResolveChargebackInput = z.input<typeof resolveChargebackSchema>;
