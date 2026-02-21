import { describe, it, expect } from 'vitest';
import {
  CLOSE_BATCH_STATUSES, SERVER_CHECKOUT_STATUSES,
  startCloseBatchSchema,
  beginServerCheckoutSchema,
  completeServerCheckoutSchemaS10,
  recordCashDropSchema,
  recordCashPaidOutSchema,
  recordCashCountSchema,
  reconcileCloseBatchSchema,
  postCloseBatchSchema,
  lockCloseBatchSchema,
  recordDepositSchema,
  getCloseBatchSchema,
  getZReportSchema,
  listServerCheckoutsSchema,
  listCashDropsSchema,
  listCashPaidOutsSchema,
  getDepositSlipSchema,
} from '../validation';

// ── Enum Constants ──────────────────────────────────────────────

describe('Session 10 Enums', () => {
  it('CLOSE_BATCH_STATUSES has expected values', () => {
    expect(CLOSE_BATCH_STATUSES).toEqual(['open', 'in_progress', 'reconciled', 'posted', 'locked']);
  });

  it('SERVER_CHECKOUT_STATUSES has expected values', () => {
    expect(SERVER_CHECKOUT_STATUSES).toEqual(['pending', 'completed']);
  });
});

// ── startCloseBatchSchema ───────────────────────────────────────

describe('startCloseBatchSchema', () => {
  const valid = { locationId: 'loc-1', businessDate: '2026-02-21' };

  it('accepts valid input with defaults', () => {
    const result = startCloseBatchSchema.parse(valid);
    expect(result.startingFloatCents).toBe(0);
  });

  it('accepts starting float', () => {
    const result = startCloseBatchSchema.parse({ ...valid, startingFloatCents: 50000 });
    expect(result.startingFloatCents).toBe(50000);
  });

  it('accepts clientRequestId', () => {
    const result = startCloseBatchSchema.parse({ ...valid, clientRequestId: 'req-1' });
    expect(result.clientRequestId).toBe('req-1');
  });

  it('rejects missing locationId', () => {
    expect(() => startCloseBatchSchema.parse({ businessDate: '2026-02-21' })).toThrow();
  });

  it('rejects negative float', () => {
    expect(() => startCloseBatchSchema.parse({ ...valid, startingFloatCents: -100 })).toThrow();
  });
});

// ── beginServerCheckoutSchema ───────────────────────────────────

describe('beginServerCheckoutSchema', () => {
  it('accepts valid input', () => {
    const result = beginServerCheckoutSchema.parse({
      closeBatchId: 'batch-1',
      serverUserId: 'user-1',
    });
    expect(result.closeBatchId).toBe('batch-1');
  });

  it('rejects missing closeBatchId', () => {
    expect(() => beginServerCheckoutSchema.parse({ serverUserId: 'user-1' })).toThrow();
  });

  it('rejects missing serverUserId', () => {
    expect(() => beginServerCheckoutSchema.parse({ closeBatchId: 'batch-1' })).toThrow();
  });
});

// ── completeServerCheckoutSchemaS10 ─────────────────────────────

describe('completeServerCheckoutSchemaS10', () => {
  const valid = { checkoutId: 'co-1' };

  it('accepts valid input with defaults', () => {
    const result = completeServerCheckoutSchemaS10.parse(valid);
    expect(result.cashTipsDeclaredCents).toBe(0);
    expect(result.cashOwedToHouseCents).toBe(0);
  });

  it('accepts with tips and cash owed', () => {
    const result = completeServerCheckoutSchemaS10.parse({
      ...valid,
      cashTipsDeclaredCents: 5000,
      cashOwedToHouseCents: 12000,
      signature: 'base64data',
    });
    expect(result.cashTipsDeclaredCents).toBe(5000);
    expect(result.signature).toBe('base64data');
  });

  it('rejects negative cash tips', () => {
    expect(() => completeServerCheckoutSchemaS10.parse({ ...valid, cashTipsDeclaredCents: -1 })).toThrow();
  });
});

// ── recordCashDropSchema ────────────────────────────────────────

describe('recordCashDropSchema', () => {
  const valid = {
    locationId: 'loc-1',
    amountCents: 20000,
    employeeId: 'emp-1',
    businessDate: '2026-02-21',
  };

  it('accepts valid input', () => {
    const result = recordCashDropSchema.parse(valid);
    expect(result.amountCents).toBe(20000);
  });

  it('accepts optional fields', () => {
    const result = recordCashDropSchema.parse({
      ...valid,
      closeBatchId: 'batch-1',
      terminalId: 'term-1',
      notes: 'Midday drop',
    });
    expect(result.closeBatchId).toBe('batch-1');
    expect(result.notes).toBe('Midday drop');
  });

  it('rejects zero amount', () => {
    expect(() => recordCashDropSchema.parse({ ...valid, amountCents: 0 })).toThrow();
  });

  it('rejects missing employeeId', () => {
    expect(() => recordCashDropSchema.parse({ locationId: 'loc-1', amountCents: 100, businessDate: '2026-02-21' })).toThrow();
  });
});

// ── recordCashPaidOutSchema ─────────────────────────────────────

describe('recordCashPaidOutSchema', () => {
  const valid = {
    locationId: 'loc-1',
    amountCents: 5000,
    reason: 'Emergency ice purchase',
    employeeId: 'emp-1',
    businessDate: '2026-02-21',
  };

  it('accepts valid input', () => {
    const result = recordCashPaidOutSchema.parse(valid);
    expect(result.reason).toBe('Emergency ice purchase');
  });

  it('accepts optional fields', () => {
    const result = recordCashPaidOutSchema.parse({
      ...valid,
      closeBatchId: 'batch-1',
      vendorName: 'Ice Co',
      approvedBy: 'mgr-1',
    });
    expect(result.vendorName).toBe('Ice Co');
    expect(result.approvedBy).toBe('mgr-1');
  });

  it('rejects empty reason', () => {
    expect(() => recordCashPaidOutSchema.parse({ ...valid, reason: '' })).toThrow();
  });

  it('rejects zero amount', () => {
    expect(() => recordCashPaidOutSchema.parse({ ...valid, amountCents: 0 })).toThrow();
  });
});

// ── recordCashCountSchema ───────────────────────────────────────

describe('recordCashCountSchema', () => {
  it('accepts valid input', () => {
    const result = recordCashCountSchema.parse({
      closeBatchId: 'batch-1',
      cashCountedCents: 45000,
    });
    expect(result.cashCountedCents).toBe(45000);
  });

  it('accepts zero count (empty drawer)', () => {
    const result = recordCashCountSchema.parse({
      closeBatchId: 'batch-1',
      cashCountedCents: 0,
    });
    expect(result.cashCountedCents).toBe(0);
  });

  it('rejects negative count', () => {
    expect(() => recordCashCountSchema.parse({ closeBatchId: 'batch-1', cashCountedCents: -1 })).toThrow();
  });

  it('rejects missing closeBatchId', () => {
    expect(() => recordCashCountSchema.parse({ cashCountedCents: 100 })).toThrow();
  });
});

// ── reconcileCloseBatchSchema ───────────────────────────────────

describe('reconcileCloseBatchSchema', () => {
  it('accepts valid input', () => {
    const result = reconcileCloseBatchSchema.parse({ closeBatchId: 'batch-1' });
    expect(result.closeBatchId).toBe('batch-1');
  });

  it('accepts with notes', () => {
    const result = reconcileCloseBatchSchema.parse({
      closeBatchId: 'batch-1',
      notes: 'Cash short by $5',
    });
    expect(result.notes).toBe('Cash short by $5');
  });
});

// ── postCloseBatchSchema ────────────────────────────────────────

describe('postCloseBatchSchema', () => {
  it('accepts valid input', () => {
    const result = postCloseBatchSchema.parse({ closeBatchId: 'batch-1' });
    expect(result.closeBatchId).toBe('batch-1');
  });

  it('accepts with glJournalEntryId', () => {
    const result = postCloseBatchSchema.parse({
      closeBatchId: 'batch-1',
      glJournalEntryId: 'je-1',
    });
    expect(result.glJournalEntryId).toBe('je-1');
  });
});

// ── lockCloseBatchSchema ────────────────────────────────────────

describe('lockCloseBatchSchema', () => {
  it('accepts valid input', () => {
    const result = lockCloseBatchSchema.parse({ closeBatchId: 'batch-1' });
    expect(result.closeBatchId).toBe('batch-1');
  });

  it('rejects empty closeBatchId', () => {
    expect(() => lockCloseBatchSchema.parse({ closeBatchId: '' })).toThrow();
  });
});

// ── recordDepositSchema ─────────────────────────────────────────

describe('recordDepositSchema', () => {
  const valid = {
    closeBatchId: 'batch-1',
    locationId: 'loc-1',
    depositAmountCents: 100000,
    depositDate: '2026-02-22',
  };

  it('accepts valid input', () => {
    const result = recordDepositSchema.parse(valid);
    expect(result.depositAmountCents).toBe(100000);
  });

  it('accepts optional fields', () => {
    const result = recordDepositSchema.parse({
      ...valid,
      bankReference: 'DEP-12345',
      notes: 'Night deposit',
    });
    expect(result.bankReference).toBe('DEP-12345');
  });

  it('rejects zero deposit', () => {
    expect(() => recordDepositSchema.parse({ ...valid, depositAmountCents: 0 })).toThrow();
  });

  it('rejects missing depositDate', () => {
    expect(() => recordDepositSchema.parse({
      closeBatchId: 'batch-1',
      locationId: 'loc-1',
      depositAmountCents: 100,
    })).toThrow();
  });
});

// ── Query Filter Schemas ────────────────────────────────────────

describe('getCloseBatchSchema', () => {
  it('accepts valid input', () => {
    const result = getCloseBatchSchema.parse({ tenantId: 't-1', closeBatchId: 'batch-1' });
    expect(result.closeBatchId).toBe('batch-1');
  });

  it('rejects missing closeBatchId', () => {
    expect(() => getCloseBatchSchema.parse({ tenantId: 't-1' })).toThrow();
  });
});

describe('getZReportSchema', () => {
  it('accepts valid input', () => {
    const result = getZReportSchema.parse({ tenantId: 't-1', closeBatchId: 'batch-1' });
    expect(result.closeBatchId).toBe('batch-1');
  });
});

describe('listServerCheckoutsSchema', () => {
  it('accepts valid input', () => {
    const result = listServerCheckoutsSchema.parse({ tenantId: 't-1', closeBatchId: 'batch-1' });
    expect(result.closeBatchId).toBe('batch-1');
  });

  it('accepts status filter', () => {
    const result = listServerCheckoutsSchema.parse({
      tenantId: 't-1', closeBatchId: 'batch-1', status: 'completed',
    });
    expect(result.status).toBe('completed');
  });

  it('rejects invalid status', () => {
    expect(() => listServerCheckoutsSchema.parse({
      tenantId: 't-1', closeBatchId: 'batch-1', status: 'unknown',
    })).toThrow();
  });
});

describe('listCashDropsSchema', () => {
  it('accepts valid input', () => {
    const result = listCashDropsSchema.parse({
      tenantId: 't-1', locationId: 'loc-1', businessDate: '2026-02-21',
    });
    expect(result.businessDate).toBe('2026-02-21');
  });
});

describe('listCashPaidOutsSchema', () => {
  it('accepts valid input', () => {
    const result = listCashPaidOutsSchema.parse({
      tenantId: 't-1', locationId: 'loc-1', businessDate: '2026-02-21',
    });
    expect(result.locationId).toBe('loc-1');
  });
});

describe('getDepositSlipSchema', () => {
  it('accepts valid input', () => {
    const result = getDepositSlipSchema.parse({ tenantId: 't-1', closeBatchId: 'batch-1' });
    expect(result.closeBatchId).toBe('batch-1');
  });

  it('rejects missing tenantId', () => {
    expect(() => getDepositSlipSchema.parse({ closeBatchId: 'batch-1' })).toThrow();
  });
});
