import { describe, it, expect } from 'vitest';
import {
  PREAUTH_STATUSES,
  createPreauthSchema,
  capturePreauthSchema,
  voidPreauthSchema,
  adjustTipSchema,
  finalizeTipSchema,
  markTabWalkoutSchema,
  getTabPreauthsSchema,
  listTipAdjustmentsSchema,
  listOpenPreauthsSchema,
} from '../validation';

// ── Enum Constants ──────────────────────────────────────────────

describe('Session 8 Enums', () => {
  it('PREAUTH_STATUSES has expected values', () => {
    expect(PREAUTH_STATUSES).toEqual([
      'authorized', 'captured', 'adjusted', 'finalized', 'voided', 'expired',
    ]);
  });
});

// ── createPreauthSchema ─────────────────────────────────────────

describe('createPreauthSchema', () => {
  const valid = {
    tabId: 'tab-1',
    authAmountCents: 5000,
    cardToken: 'tok_abc123',
    cardLast4: '4242',
  };

  it('accepts minimal valid input', () => {
    const result = createPreauthSchema.parse(valid);
    expect(result.tabId).toBe('tab-1');
    expect(result.authAmountCents).toBe(5000);
    expect(result.expiresInHours).toBe(24); // default
  });

  it('accepts optional fields', () => {
    const result = createPreauthSchema.parse({
      ...valid,
      cardBrand: 'visa',
      providerRef: 'pi_123',
      expiresInHours: 48,
    });
    expect(result.cardBrand).toBe('visa');
    expect(result.providerRef).toBe('pi_123');
    expect(result.expiresInHours).toBe(48);
  });

  it('rejects invalid card last4', () => {
    expect(() => createPreauthSchema.parse({ ...valid, cardLast4: '123' })).toThrow();
    expect(() => createPreauthSchema.parse({ ...valid, cardLast4: '12345' })).toThrow();
    expect(() => createPreauthSchema.parse({ ...valid, cardLast4: 'abcd' })).toThrow();
  });

  it('rejects auth amount over max ($200 = 20000 cents)', () => {
    expect(() => createPreauthSchema.parse({ ...valid, authAmountCents: 20001 })).toThrow();
  });

  it('rejects auth amount less than 1', () => {
    expect(() => createPreauthSchema.parse({ ...valid, authAmountCents: 0 })).toThrow();
  });

  it('rejects expires beyond 168 hours', () => {
    expect(() => createPreauthSchema.parse({ ...valid, expiresInHours: 169 })).toThrow();
  });

  it('rejects empty card token', () => {
    expect(() => createPreauthSchema.parse({ ...valid, cardToken: '' })).toThrow();
  });
});

// ── capturePreauthSchema ────────────────────────────────────────

describe('capturePreauthSchema', () => {
  const valid = { preauthId: 'pre-1', captureAmountCents: 4500 };

  it('accepts minimal valid input', () => {
    const result = capturePreauthSchema.parse(valid);
    expect(result.tipAmountCents).toBe(0); // default
    expect(result.overrideThreshold).toBe(false); // default
  });

  it('accepts tip and override', () => {
    const result = capturePreauthSchema.parse({
      ...valid,
      tipAmountCents: 900,
      overrideThreshold: true,
    });
    expect(result.tipAmountCents).toBe(900);
    expect(result.overrideThreshold).toBe(true);
  });

  it('accepts zero capture (fully comped tab)', () => {
    const result = capturePreauthSchema.parse({ ...valid, captureAmountCents: 0 });
    expect(result.captureAmountCents).toBe(0);
  });

  it('rejects missing preauthId', () => {
    expect(() => capturePreauthSchema.parse({ captureAmountCents: 4500 })).toThrow();
  });
});

// ── voidPreauthSchema ──────────────────────────────────────────

describe('voidPreauthSchema', () => {
  it('accepts minimal valid input', () => {
    const result = voidPreauthSchema.parse({ preauthId: 'pre-1' });
    expect(result.preauthId).toBe('pre-1');
  });

  it('accepts optional reason', () => {
    const result = voidPreauthSchema.parse({ preauthId: 'pre-1', reason: 'Card returned' });
    expect(result.reason).toBe('Card returned');
  });

  it('rejects reason exceeding 500 chars', () => {
    expect(() => voidPreauthSchema.parse({ preauthId: 'pre-1', reason: 'x'.repeat(501) })).toThrow();
  });
});

// ── adjustTipSchema ────────────────────────────────────────────

describe('adjustTipSchema', () => {
  const valid = { tabId: 'tab-1', adjustedTipCents: 1000 };

  it('accepts minimal valid input', () => {
    const result = adjustTipSchema.parse(valid);
    expect(result.originalTipCents).toBe(0); // default
  });

  it('accepts preauth-based tip adjustment', () => {
    const result = adjustTipSchema.parse({
      ...valid,
      preauthId: 'pre-1',
      originalTipCents: 500,
      adjustmentReason: 'Customer changed tip',
    });
    expect(result.preauthId).toBe('pre-1');
    expect(result.originalTipCents).toBe(500);
  });

  it('accepts tender-based tip adjustment', () => {
    const result = adjustTipSchema.parse({
      ...valid,
      tenderId: 'tender-1',
    });
    expect(result.tenderId).toBe('tender-1');
  });

  it('rejects missing tabId', () => {
    expect(() => adjustTipSchema.parse({ adjustedTipCents: 1000 })).toThrow();
  });

  it('rejects negative adjusted tip', () => {
    expect(() => adjustTipSchema.parse({ ...valid, adjustedTipCents: -1 })).toThrow();
  });
});

// ── finalizeTipSchema ──────────────────────────────────────────

describe('finalizeTipSchema', () => {
  it('accepts valid input', () => {
    const result = finalizeTipSchema.parse({ tabId: 'tab-1' });
    expect(result.tabId).toBe('tab-1');
  });

  it('rejects missing tabId', () => {
    expect(() => finalizeTipSchema.parse({})).toThrow();
  });
});

// ── markTabWalkoutSchema ───────────────────────────────────────

describe('markTabWalkoutSchema', () => {
  it('accepts minimal valid input', () => {
    const result = markTabWalkoutSchema.parse({ tabId: 'tab-1' });
    expect(result.tabId).toBe('tab-1');
  });

  it('accepts auto gratuity percentage', () => {
    const result = markTabWalkoutSchema.parse({
      tabId: 'tab-1',
      autoGratuityPercentage: 20,
      reason: 'Customer left without paying',
    });
    expect(result.autoGratuityPercentage).toBe(20);
    expect(result.reason).toBe('Customer left without paying');
  });

  it('rejects gratuity over 100%', () => {
    expect(() => markTabWalkoutSchema.parse({ tabId: 'tab-1', autoGratuityPercentage: 101 })).toThrow();
  });

  it('rejects missing tabId', () => {
    expect(() => markTabWalkoutSchema.parse({})).toThrow();
  });
});

// ── Query Filter Schemas ────────────────────────────────────────

describe('getTabPreauthsSchema', () => {
  it('accepts valid input', () => {
    const result = getTabPreauthsSchema.parse({ tenantId: 't-1', tabId: 'tab-1' });
    expect(result.tabId).toBe('tab-1');
  });

  it('rejects missing tabId', () => {
    expect(() => getTabPreauthsSchema.parse({ tenantId: 't-1' })).toThrow();
  });
});

describe('listTipAdjustmentsSchema', () => {
  it('accepts valid input', () => {
    const result = listTipAdjustmentsSchema.parse({ tenantId: 't-1', tabId: 'tab-1' });
    expect(result.tabId).toBe('tab-1');
  });

  it('accepts optional isFinal filter', () => {
    const result = listTipAdjustmentsSchema.parse({ tenantId: 't-1', tabId: 'tab-1', isFinal: true });
    expect(result.isFinal).toBe(true);
  });

  it('rejects missing tabId', () => {
    expect(() => listTipAdjustmentsSchema.parse({ tenantId: 't-1' })).toThrow();
  });
});

describe('listOpenPreauthsSchema', () => {
  it('accepts valid input with defaults', () => {
    const result = listOpenPreauthsSchema.parse({ tenantId: 't-1' });
    expect(result.status).toBe('authorized'); // default
  });

  it('accepts optional locationId', () => {
    const result = listOpenPreauthsSchema.parse({ tenantId: 't-1', locationId: 'loc-1' });
    expect(result.locationId).toBe('loc-1');
  });

  it('accepts status override', () => {
    const result = listOpenPreauthsSchema.parse({ tenantId: 't-1', status: 'captured' });
    expect(result.status).toBe('captured');
  });

  it('rejects invalid status', () => {
    expect(() => listOpenPreauthsSchema.parse({ tenantId: 't-1', status: 'unknown' })).toThrow();
  });
});
