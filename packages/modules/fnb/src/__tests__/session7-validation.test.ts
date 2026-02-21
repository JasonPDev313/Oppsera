import { describe, it, expect } from 'vitest';
import {
  PAYMENT_SESSION_STATUSES,
  CHECK_SPLIT_STRATEGIES,
  createAutoGratuityRuleSchema,
  updateAutoGratuityRuleSchema,
  presentCheckSchema,
  startPaymentSessionSchema,
  completePaymentSessionSchema,
  failPaymentSessionSchema,
  applySplitStrategySchema,
  rejoinChecksSchema,
  compItemSchema,
  discountCheckSchema,
  voidCheckSchema,
  refundCheckSchema,
  listAutoGratuityRulesSchema,
  getPaymentSessionSchema,
  listPaymentSessionsSchema,
  getCheckSummarySchema,
} from '../validation';

// ── Enum Constants ──────────────────────────────────────────────

describe('Session 7 Enums', () => {
  it('PAYMENT_SESSION_STATUSES has expected values', () => {
    expect(PAYMENT_SESSION_STATUSES).toEqual(['pending', 'in_progress', 'completed', 'failed']);
  });

  it('CHECK_SPLIT_STRATEGIES has expected values', () => {
    expect(CHECK_SPLIT_STRATEGIES).toEqual(['by_seat', 'by_item', 'equal_split', 'custom_amount']);
  });
});

// ── createAutoGratuityRuleSchema ────────────────────────────────

describe('createAutoGratuityRuleSchema', () => {
  const valid = {
    name: 'Large Party',
    partySizeThreshold: 6,
    gratuityPercentage: '18.00',
  };

  it('accepts minimal valid input', () => {
    const result = createAutoGratuityRuleSchema.parse(valid);
    expect(result.name).toBe('Large Party');
    expect(result.partySizeThreshold).toBe(6);
    expect(result.isTaxable).toBe(false); // default
    expect(result.isActive).toBe(true); // default
  });

  it('accepts all optional fields', () => {
    const result = createAutoGratuityRuleSchema.parse({
      ...valid,
      isTaxable: true,
      isActive: false,
      clientRequestId: 'req-1',
    });
    expect(result.isTaxable).toBe(true);
    expect(result.isActive).toBe(false);
  });

  it('rejects invalid gratuity percentage format', () => {
    expect(() => createAutoGratuityRuleSchema.parse({ ...valid, gratuityPercentage: 'abc' })).toThrow();
  });

  it('rejects percentage with too many decimals', () => {
    expect(() => createAutoGratuityRuleSchema.parse({ ...valid, gratuityPercentage: '18.123' })).toThrow();
  });

  it('accepts whole number percentage', () => {
    const result = createAutoGratuityRuleSchema.parse({ ...valid, gratuityPercentage: '20' });
    expect(result.gratuityPercentage).toBe('20');
  });

  it('rejects party size less than 1', () => {
    expect(() => createAutoGratuityRuleSchema.parse({ ...valid, partySizeThreshold: 0 })).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => createAutoGratuityRuleSchema.parse({ ...valid, name: '' })).toThrow();
  });
});

// ── updateAutoGratuityRuleSchema ────────────────────────────────

describe('updateAutoGratuityRuleSchema', () => {
  it('accepts partial update', () => {
    const result = updateAutoGratuityRuleSchema.parse({ name: 'Updated Rule' });
    expect(result.name).toBe('Updated Rule');
  });

  it('accepts isActive toggle', () => {
    const result = updateAutoGratuityRuleSchema.parse({ isActive: false });
    expect(result.isActive).toBe(false);
  });

  it('accepts empty update (all optional)', () => {
    const result = updateAutoGratuityRuleSchema.parse({});
    expect(result).toBeDefined();
  });
});

// ── presentCheckSchema ──────────────────────────────────────────

describe('presentCheckSchema', () => {
  const valid = { tabId: 'tab-1', orderId: 'order-1' };

  it('accepts minimal valid input', () => {
    const result = presentCheckSchema.parse(valid);
    expect(result.tabId).toBe('tab-1');
    expect(result.perSeat).toBe(false); // default
  });

  it('accepts perSeat option', () => {
    const result = presentCheckSchema.parse({ ...valid, perSeat: true });
    expect(result.perSeat).toBe(true);
  });

  it('rejects missing tabId', () => {
    expect(() => presentCheckSchema.parse({ orderId: 'order-1' })).toThrow();
  });

  it('rejects missing orderId', () => {
    expect(() => presentCheckSchema.parse({ tabId: 'tab-1' })).toThrow();
  });
});

// ── startPaymentSessionSchema ───────────────────────────────────

describe('startPaymentSessionSchema', () => {
  const valid = { tabId: 'tab-1', orderId: 'order-1', totalAmountCents: 5000 };

  it('accepts valid input', () => {
    const result = startPaymentSessionSchema.parse(valid);
    expect(result.totalAmountCents).toBe(5000);
  });

  it('accepts zero total (e.g., fully comped)', () => {
    const result = startPaymentSessionSchema.parse({ ...valid, totalAmountCents: 0 });
    expect(result.totalAmountCents).toBe(0);
  });

  it('rejects negative total', () => {
    expect(() => startPaymentSessionSchema.parse({ ...valid, totalAmountCents: -100 })).toThrow();
  });
});

// ── completePaymentSessionSchema ────────────────────────────────

describe('completePaymentSessionSchema', () => {
  it('accepts minimal valid input', () => {
    const result = completePaymentSessionSchema.parse({ sessionId: 'sess-1' });
    expect(result.changeCents).toBe(0); // default
  });

  it('accepts change amount', () => {
    const result = completePaymentSessionSchema.parse({ sessionId: 'sess-1', changeCents: 350 });
    expect(result.changeCents).toBe(350);
  });

  it('rejects missing sessionId', () => {
    expect(() => completePaymentSessionSchema.parse({})).toThrow();
  });
});

// ── failPaymentSessionSchema ────────────────────────────────────

describe('failPaymentSessionSchema', () => {
  it('accepts valid input', () => {
    const result = failPaymentSessionSchema.parse({ sessionId: 'sess-1', reason: 'Card declined' });
    expect(result.reason).toBe('Card declined');
  });

  it('rejects missing reason', () => {
    expect(() => failPaymentSessionSchema.parse({ sessionId: 'sess-1' })).toThrow();
  });

  it('rejects empty reason', () => {
    expect(() => failPaymentSessionSchema.parse({ sessionId: 'sess-1', reason: '' })).toThrow();
  });

  it('rejects reason exceeding 500 chars', () => {
    expect(() => failPaymentSessionSchema.parse({ sessionId: 'sess-1', reason: 'x'.repeat(501) })).toThrow();
  });
});

// ── applySplitStrategySchema ────────────────────────────────────

describe('applySplitStrategySchema', () => {
  const valid = {
    tabId: 'tab-1',
    orderId: 'order-1',
    strategy: 'equal_split' as const,
    expectedVersion: 1,
  };

  it('accepts equal_split with splitCount', () => {
    const result = applySplitStrategySchema.parse({ ...valid, splitCount: 3 });
    expect(result.strategy).toBe('equal_split');
    expect(result.splitCount).toBe(3);
  });

  it('accepts by_seat strategy', () => {
    const result = applySplitStrategySchema.parse({
      ...valid,
      strategy: 'by_seat',
      seatAssignments: { 'check-a': [1, 2], 'check-b': [3, 4] },
    });
    expect(result.strategy).toBe('by_seat');
  });

  it('accepts by_item strategy', () => {
    const result = applySplitStrategySchema.parse({
      ...valid,
      strategy: 'by_item',
      itemAssignments: { 'check-a': ['line-1', 'line-2'], 'check-b': ['line-3'] },
    });
    expect(result.strategy).toBe('by_item');
  });

  it('accepts custom_amount strategy', () => {
    const result = applySplitStrategySchema.parse({
      ...valid,
      strategy: 'custom_amount',
      customAmounts: [
        { label: 'Guest 1', amountCents: 5000 },
        { amountCents: 3000 },
      ],
    });
    expect(result.customAmounts).toHaveLength(2);
  });

  it('rejects invalid strategy', () => {
    expect(() => applySplitStrategySchema.parse({ ...valid, strategy: 'unknown' })).toThrow();
  });

  it('rejects splitCount less than 2', () => {
    expect(() => applySplitStrategySchema.parse({ ...valid, splitCount: 1 })).toThrow();
  });

  it('rejects splitCount greater than 20', () => {
    expect(() => applySplitStrategySchema.parse({ ...valid, splitCount: 21 })).toThrow();
  });

  it('rejects missing expectedVersion', () => {
    expect(() => applySplitStrategySchema.parse({ tabId: 'tab-1', orderId: 'o-1', strategy: 'equal_split' })).toThrow();
  });
});

// ── rejoinChecksSchema ──────────────────────────────────────────

describe('rejoinChecksSchema', () => {
  it('accepts valid input', () => {
    const result = rejoinChecksSchema.parse({ tabId: 'tab-1', expectedVersion: 2 });
    expect(result.tabId).toBe('tab-1');
  });

  it('rejects missing expectedVersion', () => {
    expect(() => rejoinChecksSchema.parse({ tabId: 'tab-1' })).toThrow();
  });
});

// ── compItemSchema ──────────────────────────────────────────────

describe('compItemSchema', () => {
  const valid = { orderId: 'order-1', orderLineId: 'line-1', reason: 'Manager comp' };

  it('accepts valid input', () => {
    const result = compItemSchema.parse(valid);
    expect(result.reason).toBe('Manager comp');
  });

  it('rejects missing reason', () => {
    expect(() => compItemSchema.parse({ orderId: 'order-1', orderLineId: 'line-1' })).toThrow();
  });

  it('rejects empty reason', () => {
    expect(() => compItemSchema.parse({ ...valid, reason: '' })).toThrow();
  });
});

// ── discountCheckSchema ─────────────────────────────────────────

describe('discountCheckSchema', () => {
  it('accepts percentage discount', () => {
    const result = discountCheckSchema.parse({ orderId: 'order-1', discountType: 'percentage', value: 10 });
    expect(result.discountType).toBe('percentage');
    expect(result.value).toBe(10);
  });

  it('accepts fixed discount', () => {
    const result = discountCheckSchema.parse({ orderId: 'order-1', discountType: 'fixed', value: 500 });
    expect(result.discountType).toBe('fixed');
  });

  it('accepts optional reason', () => {
    const result = discountCheckSchema.parse({
      orderId: 'order-1', discountType: 'percentage', value: 15, reason: 'Happy hour',
    });
    expect(result.reason).toBe('Happy hour');
  });

  it('rejects invalid discount type', () => {
    expect(() => discountCheckSchema.parse({ orderId: 'order-1', discountType: 'bogo', value: 10 })).toThrow();
  });

  it('rejects negative value', () => {
    expect(() => discountCheckSchema.parse({ orderId: 'order-1', discountType: 'fixed', value: -1 })).toThrow();
  });
});

// ── voidCheckSchema ─────────────────────────────────────────────

describe('voidCheckSchema', () => {
  it('accepts valid input', () => {
    const result = voidCheckSchema.parse({ orderId: 'order-1', reason: 'Customer walked out' });
    expect(result.reason).toBe('Customer walked out');
  });

  it('rejects empty reason', () => {
    expect(() => voidCheckSchema.parse({ orderId: 'order-1', reason: '' })).toThrow();
  });
});

// ── refundCheckSchema ───────────────────────────────────────────

describe('refundCheckSchema', () => {
  const valid = { tenderId: 'tender-1', amountCents: 2000, reason: 'Overcharge' };

  it('accepts minimal valid input', () => {
    const result = refundCheckSchema.parse(valid);
    expect(result.refundMethod).toBe('original'); // default
  });

  it('accepts cash refund method', () => {
    const result = refundCheckSchema.parse({ ...valid, refundMethod: 'cash' });
    expect(result.refundMethod).toBe('cash');
  });

  it('accepts store_credit refund method', () => {
    const result = refundCheckSchema.parse({ ...valid, refundMethod: 'store_credit' });
    expect(result.refundMethod).toBe('store_credit');
  });

  it('rejects zero amount', () => {
    expect(() => refundCheckSchema.parse({ ...valid, amountCents: 0 })).toThrow();
  });

  it('rejects invalid refund method', () => {
    expect(() => refundCheckSchema.parse({ ...valid, refundMethod: 'bitcoin' })).toThrow();
  });

  it('rejects missing reason', () => {
    expect(() => refundCheckSchema.parse({ tenderId: 'tender-1', amountCents: 2000 })).toThrow();
  });
});

// ── Query Filter Schemas ────────────────────────────────────────

describe('listAutoGratuityRulesSchema', () => {
  it('accepts valid input with defaults', () => {
    const result = listAutoGratuityRulesSchema.parse({ tenantId: 't-1' });
    expect(result.isActive).toBe(true); // default
  });

  it('accepts optional locationId', () => {
    const result = listAutoGratuityRulesSchema.parse({ tenantId: 't-1', locationId: 'loc-1' });
    expect(result.locationId).toBe('loc-1');
  });

  it('accepts isActive override', () => {
    const result = listAutoGratuityRulesSchema.parse({ tenantId: 't-1', isActive: false });
    expect(result.isActive).toBe(false);
  });
});

describe('getPaymentSessionSchema', () => {
  it('accepts valid input', () => {
    const result = getPaymentSessionSchema.parse({ tenantId: 't-1', sessionId: 'sess-1' });
    expect(result.sessionId).toBe('sess-1');
  });

  it('rejects missing sessionId', () => {
    expect(() => getPaymentSessionSchema.parse({ tenantId: 't-1' })).toThrow();
  });
});

describe('listPaymentSessionsSchema', () => {
  it('accepts valid input', () => {
    const result = listPaymentSessionsSchema.parse({ tenantId: 't-1', tabId: 'tab-1' });
    expect(result.tabId).toBe('tab-1');
  });

  it('accepts optional status filter', () => {
    const result = listPaymentSessionsSchema.parse({ tenantId: 't-1', tabId: 'tab-1', status: 'completed' });
    expect(result.status).toBe('completed');
  });

  it('rejects invalid status', () => {
    expect(() => listPaymentSessionsSchema.parse({ tenantId: 't-1', tabId: 'tab-1', status: 'cancelled' })).toThrow();
  });
});

describe('getCheckSummarySchema', () => {
  it('accepts valid input', () => {
    const result = getCheckSummarySchema.parse({ tenantId: 't-1', orderId: 'order-1' });
    expect(result.orderId).toBe('order-1');
  });

  it('rejects missing orderId', () => {
    expect(() => getCheckSummarySchema.parse({ tenantId: 't-1' })).toThrow();
  });
});
