import { z } from 'zod';

export const TenderRecordedDataSchema = z.object({
  tenderId: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  locationId: z.string(),
  businessDate: z.string(),
  tenderType: z.string(),
  tenderSequence: z.number().int(),
  amount: z.number().int(),
  tipAmount: z.number().int(),
  changeGiven: z.number().int(),
  amountGiven: z.number().int(),
  employeeId: z.string(),
  terminalId: z.string(),
  shiftId: z.string().nullable(),
  posMode: z.string().nullable(),
  source: z.string(),
  orderTotal: z.number().int(),
  totalTendered: z.number().int(),
  remainingBalance: z.number().int(),
  isFullyPaid: z.boolean(),
});

export const TenderReversedDataSchema = z.object({
  reversalId: z.string(),
  originalTenderId: z.string(),
  orderId: z.string(),
  amount: z.number().int(),
  reason: z.string(),
  reversalType: z.string(),
  refundMethod: z.string().nullable(),
});

// Also import the OrderVoidedDataSchema for consumes registration
// The orders module emits order.voided.v1 which tenders consumes
export const OrderVoidedDataSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  reason: z.string(),
  voidedBy: z.string(),
});
