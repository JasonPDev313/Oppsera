import { describe, it, expect } from 'vitest';
import {
  recordTenderSchema,
  reverseTenderSchema,
  adjustTipSchema,
} from '../validation';

describe('recordTenderSchema', () => {
  const validInput = {
    clientRequestId: 'req-001',
    orderId: 'order-1',
    tenderType: 'cash',
    amountGiven: 2000,
    terminalId: 'term-1',
    employeeId: 'emp-1',
    businessDate: '2026-01-15',
  };

  it('should accept valid minimal input', () => {
    const result = recordTenderSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should default tipAmount to 0', () => {
    const parsed = recordTenderSchema.parse(validInput);
    expect(parsed.tipAmount).toBe(0);
  });

  it('should accept all optional fields', () => {
    const result = recordTenderSchema.safeParse({
      ...validInput,
      tipAmount: 200,
      shiftId: 'shift-1',
      posMode: 'retail',
      version: 3,
      metadata: {
        denominations: { '20': 1 },
        checkNumber: '1234',
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing clientRequestId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { clientRequestId, ...rest } = validInput;
    const result = recordTenderSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject empty clientRequestId', () => {
    const result = recordTenderSchema.safeParse({ ...validInput, clientRequestId: '' });
    expect(result.success).toBe(false);
  });

  it('should reject clientRequestId over 128 chars', () => {
    const result = recordTenderSchema.safeParse({
      ...validInput,
      clientRequestId: 'x'.repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty tenderType', () => {
    const result = recordTenderSchema.safeParse({ ...validInput, tenderType: '' });
    expect(result.success).toBe(false);
  });

  it('should reject tenderType over 50 chars', () => {
    const result = recordTenderSchema.safeParse({ ...validInput, tenderType: 'a'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('should accept any valid tender type string', () => {
    for (const type of ['cash', 'card', 'check', 'voucher', 'stripe_terminal', 'house_account']) {
      const result = recordTenderSchema.safeParse({ ...validInput, tenderType: type });
      expect(result.success).toBe(true);
    }
  });

  it('should reject zero amountGiven', () => {
    const result = recordTenderSchema.safeParse({ ...validInput, amountGiven: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative amountGiven', () => {
    const result = recordTenderSchema.safeParse({ ...validInput, amountGiven: -100 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer amountGiven', () => {
    const result = recordTenderSchema.safeParse({ ...validInput, amountGiven: 10.5 });
    expect(result.success).toBe(false);
  });

  it('should reject invalid businessDate format', () => {
    const result = recordTenderSchema.safeParse({ ...validInput, businessDate: '2026/01/15' });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer tipAmount', () => {
    const result = recordTenderSchema.safeParse({ ...validInput, tipAmount: 3.50 });
    expect(result.success).toBe(false);
  });

  it('should reject negative tipAmount', () => {
    const result = recordTenderSchema.safeParse({ ...validInput, tipAmount: -100 });
    expect(result.success).toBe(false);
  });

  it('should reject invalid posMode', () => {
    const result = recordTenderSchema.safeParse({ ...validInput, posMode: 'kiosk' });
    expect(result.success).toBe(false);
  });

  it('should accept fnb posMode', () => {
    const result = recordTenderSchema.safeParse({ ...validInput, posMode: 'fnb' });
    expect(result.success).toBe(true);
  });
});

describe('reverseTenderSchema', () => {
  const validInput = {
    clientRequestId: 'rev-001',
    tenderId: 'tender-1',
    amount: 1500,
    reason: 'Customer returned item',
    reversalType: 'refund' as const,
  };

  it('should accept valid input', () => {
    const result = reverseTenderSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should default refundMethod to original_tender', () => {
    const parsed = reverseTenderSchema.parse(validInput);
    expect(parsed.refundMethod).toBe('original_tender');
  });

  it('should accept void reversalType', () => {
    const result = reverseTenderSchema.safeParse({ ...validInput, reversalType: 'void' });
    expect(result.success).toBe(true);
  });

  it('should accept cash refundMethod', () => {
    const result = reverseTenderSchema.safeParse({ ...validInput, refundMethod: 'cash' });
    expect(result.success).toBe(true);
  });

  it('should accept store_credit refundMethod', () => {
    const result = reverseTenderSchema.safeParse({ ...validInput, refundMethod: 'store_credit' });
    expect(result.success).toBe(true);
  });

  it('should reject zero amount', () => {
    const result = reverseTenderSchema.safeParse({ ...validInput, amount: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative amount', () => {
    const result = reverseTenderSchema.safeParse({ ...validInput, amount: -100 });
    expect(result.success).toBe(false);
  });

  it('should reject empty reason', () => {
    const result = reverseTenderSchema.safeParse({ ...validInput, reason: '' });
    expect(result.success).toBe(false);
  });

  it('should reject reason over 500 chars', () => {
    const result = reverseTenderSchema.safeParse({ ...validInput, reason: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('should reject invalid reversalType', () => {
    const result = reverseTenderSchema.safeParse({ ...validInput, reversalType: 'chargeback' });
    expect(result.success).toBe(false);
  });

  it('should reject missing clientRequestId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { clientRequestId, ...rest } = validInput;
    const result = reverseTenderSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('adjustTipSchema', () => {
  const validInput = {
    clientRequestId: 'tip-001',
    tenderId: 'tender-1',
    newTipAmount: 500,
  };

  it('should accept valid input', () => {
    const result = adjustTipSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept zero newTipAmount (remove tip)', () => {
    const result = adjustTipSchema.safeParse({ ...validInput, newTipAmount: 0 });
    expect(result.success).toBe(true);
  });

  it('should accept optional reason', () => {
    const result = adjustTipSchema.safeParse({ ...validInput, reason: 'Customer requested increase' });
    expect(result.success).toBe(true);
  });

  it('should reject negative newTipAmount', () => {
    const result = adjustTipSchema.safeParse({ ...validInput, newTipAmount: -100 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer newTipAmount', () => {
    const result = adjustTipSchema.safeParse({ ...validInput, newTipAmount: 5.50 });
    expect(result.success).toBe(false);
  });

  it('should reject reason over 500 chars', () => {
    const result = adjustTipSchema.safeParse({ ...validInput, reason: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('should reject missing clientRequestId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { clientRequestId, ...rest } = validInput;
    const result = adjustTipSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject missing tenderId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenderId, ...rest } = validInput;
    const result = adjustTipSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});
