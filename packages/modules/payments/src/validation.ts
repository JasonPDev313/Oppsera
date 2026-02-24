import { z } from 'zod';

// clientRequestId is REQUIRED for tenders (not optional like orders)
export const recordTenderSchema = z.object({
  clientRequestId: z.string().min(1).max(128), // REQUIRED
  orderId: z.string().min(1),
  tenderType: z.string().min(1).max(50), // Accepts any registered tender type code
  amountGiven: z.number().int().min(0), // cents
  tipAmount: z.number().int().min(0).default(0),
  terminalId: z.string().min(1),
  employeeId: z.string().min(1),
  businessDate: z.string().date(),
  shiftId: z.string().optional(),
  posMode: z.enum(['retail', 'fnb']).optional(),
  version: z.number().int().optional(), // optimistic locking
  metadata: z
    .object({
      denominations: z.record(z.string(), z.number()).optional(),
      checkNumber: z.string().max(50).optional(),
      // Card payment fields (populated by gateway integration at API layer)
      paymentIntentId: z.string().optional(),
      providerRef: z.string().optional(),
      cardLast4: z.string().max(4).optional(),
      cardBrand: z.string().max(20).optional(),
    })
    .optional(),
});
export type RecordTenderInput = z.input<typeof recordTenderSchema>;

export const reverseTenderSchema = z.object({
  clientRequestId: z.string().min(1).max(128), // REQUIRED
  tenderId: z.string().min(1),
  amount: z.number().int().min(1),
  reason: z.string().min(1).max(500),
  reversalType: z.enum(['void', 'refund']),
  refundMethod: z
    .enum(['original_tender', 'cash', 'store_credit'])
    .default('original_tender'),
});
export type ReverseTenderInput = z.input<typeof reverseTenderSchema>;

export const adjustTipSchema = z.object({
  clientRequestId: z.string().min(1).max(128), // REQUIRED
  tenderId: z.string().min(1),
  newTipAmount: z.number().int().min(0), // cents — the new total tip amount (not a delta)
  reason: z.string().max(500).optional(),
});
export type AdjustTipInput = z.input<typeof adjustTipSchema>;
