import { describe, it, expect } from 'vitest';
import {
  authorizePaymentSchema,
  capturePaymentSchema,
  salePaymentSchema,
  voidPaymentSchema,
  refundPaymentSchema,
  tokenizeCardSchema,
  createPaymentProfileSchema,
  inquirePaymentSchema,
  searchTransactionsSchema,
} from '../gateway-validation';

// ── authorizePaymentSchema ───────────────────────────────────

describe('authorizePaymentSchema', () => {
  const valid = {
    clientRequestId: 'auth-001',
    amountCents: 5000,
    token: '9418594164541111',
    expiry: '1225',
  };

  it('should accept valid input', () => {
    expect(authorizePaymentSchema.safeParse(valid).success).toBe(true);
  });

  it('should default currency to USD', () => {
    const parsed = authorizePaymentSchema.parse(valid);
    expect(parsed.currency).toBe('USD');
  });

  it('should default paymentMethodType to card', () => {
    const parsed = authorizePaymentSchema.parse(valid);
    expect(parsed.paymentMethodType).toBe('card');
  });

  it('should default ecomind to E', () => {
    const parsed = authorizePaymentSchema.parse(valid);
    expect(parsed.ecomind).toBe('E');
  });

  it('should reject missing clientRequestId', () => {
    const { clientRequestId: _clientRequestId, ...rest } = valid;
    expect(authorizePaymentSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject zero amountCents', () => {
    expect(
      authorizePaymentSchema.safeParse({ ...valid, amountCents: 0 }).success,
    ).toBe(false);
  });

  it('should reject negative amountCents', () => {
    expect(
      authorizePaymentSchema.safeParse({ ...valid, amountCents: -100 }).success,
    ).toBe(false);
  });

  it('should reject non-integer amountCents', () => {
    expect(
      authorizePaymentSchema.safeParse({ ...valid, amountCents: 50.5 }).success,
    ).toBe(false);
  });

  it('should accept optional fields', () => {
    const result = authorizePaymentSchema.safeParse({
      ...valid,
      cvv: '123',
      orderId: 'order-1',
      customerId: 'cust-1',
      terminalId: 'term-1',
      locationId: 'loc-1',
      paymentMethodType: 'terminal',
      ecomind: 'T',
      name: 'John Doe',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid expiry format', () => {
    expect(
      authorizePaymentSchema.safeParse({ ...valid, expiry: '12/25' }).success,
    ).toBe(false);
  });

  it('should reject clientRequestId over 128 chars', () => {
    expect(
      authorizePaymentSchema.safeParse({
        ...valid,
        clientRequestId: 'x'.repeat(129),
      }).success,
    ).toBe(false);
  });
});

// ── capturePaymentSchema ─────────────────────────────────────

describe('capturePaymentSchema', () => {
  const valid = {
    clientRequestId: 'cap-001',
    paymentIntentId: 'intent-1',
  };

  it('should accept valid input', () => {
    expect(capturePaymentSchema.safeParse(valid).success).toBe(true);
  });

  it('should accept optional amountCents for partial capture', () => {
    const result = capturePaymentSchema.safeParse({
      ...valid,
      amountCents: 2500,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing paymentIntentId', () => {
    const { paymentIntentId: _paymentIntentId, ...rest } = valid;
    expect(capturePaymentSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject zero amountCents', () => {
    expect(
      capturePaymentSchema.safeParse({ ...valid, amountCents: 0 }).success,
    ).toBe(false);
  });
});

// ── salePaymentSchema ────────────────────────────────────────

describe('salePaymentSchema', () => {
  const valid = {
    clientRequestId: 'sale-001',
    amountCents: 1000,
    token: '9418594164541111',
  };

  it('should accept valid input', () => {
    expect(salePaymentSchema.safeParse(valid).success).toBe(true);
  });

  it('should default tipCents to 0', () => {
    const parsed = salePaymentSchema.parse(valid);
    expect(parsed.tipCents).toBe(0);
  });

  it('should accept tipCents', () => {
    const parsed = salePaymentSchema.parse({ ...valid, tipCents: 200 });
    expect(parsed.tipCents).toBe(200);
  });

  it('should reject negative tipCents', () => {
    expect(
      salePaymentSchema.safeParse({ ...valid, tipCents: -100 }).success,
    ).toBe(false);
  });

  it('should accept paymentMethodId for stored method', () => {
    expect(
      salePaymentSchema.safeParse({
        ...valid,
        token: undefined,
        paymentMethodId: 'pm-1',
      }).success,
    ).toBe(true);
  });
});

// ── voidPaymentSchema ────────────────────────────────────────

describe('voidPaymentSchema', () => {
  const valid = {
    clientRequestId: 'void-001',
    paymentIntentId: 'intent-1',
  };

  it('should accept valid input', () => {
    expect(voidPaymentSchema.safeParse(valid).success).toBe(true);
  });

  it('should reject missing paymentIntentId', () => {
    const { paymentIntentId: _paymentIntentId, ...rest } = valid;
    expect(voidPaymentSchema.safeParse(rest).success).toBe(false);
  });

  it('should reject empty clientRequestId', () => {
    expect(
      voidPaymentSchema.safeParse({ ...valid, clientRequestId: '' }).success,
    ).toBe(false);
  });
});

// ── refundPaymentSchema ──────────────────────────────────────

describe('refundPaymentSchema', () => {
  const valid = {
    clientRequestId: 'refund-001',
    paymentIntentId: 'intent-1',
  };

  it('should accept valid input for full refund', () => {
    expect(refundPaymentSchema.safeParse(valid).success).toBe(true);
  });

  it('should accept amountCents for partial refund', () => {
    const result = refundPaymentSchema.safeParse({
      ...valid,
      amountCents: 500,
    });
    expect(result.success).toBe(true);
  });

  it('should reject zero amountCents', () => {
    expect(
      refundPaymentSchema.safeParse({ ...valid, amountCents: 0 }).success,
    ).toBe(false);
  });

  it('should reject non-integer amountCents', () => {
    expect(
      refundPaymentSchema.safeParse({ ...valid, amountCents: 10.5 }).success,
    ).toBe(false);
  });
});

// ── tokenizeCardSchema ───────────────────────────────────────

describe('tokenizeCardSchema', () => {
  it('should accept valid card number', () => {
    expect(
      tokenizeCardSchema.safeParse({ account: '4111111111111111' }).success,
    ).toBe(true);
  });

  it('should accept optional expiry', () => {
    const parsed = tokenizeCardSchema.parse({
      account: '4111111111111111',
      expiry: '1225',
    });
    expect(parsed.expiry).toBe('1225');
  });

  it('should reject empty account', () => {
    expect(tokenizeCardSchema.safeParse({ account: '' }).success).toBe(false);
  });
});

// ── createPaymentProfileSchema ───────────────────────────────

describe('createPaymentProfileSchema', () => {
  const valid = {
    clientRequestId: 'profile-001',
    customerId: 'cust-1',
    token: '9418594164541111',
    expiry: '1225',
  };

  it('should accept valid input', () => {
    expect(createPaymentProfileSchema.safeParse(valid).success).toBe(true);
  });

  it('should accept optional name and address', () => {
    const result = createPaymentProfileSchema.safeParse({
      ...valid,
      name: 'John Doe',
      address: '123 Main St',
      postal: '12345',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing customerId', () => {
    const { customerId: _customerId, ...rest } = valid;
    expect(createPaymentProfileSchema.safeParse(rest).success).toBe(false);
  });

  it('should default isDefault to false', () => {
    const parsed = createPaymentProfileSchema.parse(valid);
    expect(parsed.isDefault).toBe(false);
  });
});

// ── inquirePaymentSchema ─────────────────────────────────────

describe('inquirePaymentSchema', () => {
  it('should accept valid input', () => {
    expect(
      inquirePaymentSchema.safeParse({ paymentIntentId: 'intent-1' }).success,
    ).toBe(true);
  });

  it('should reject empty paymentIntentId', () => {
    expect(
      inquirePaymentSchema.safeParse({ paymentIntentId: '' }).success,
    ).toBe(false);
  });
});

// ── searchTransactionsSchema ─────────────────────────────────

describe('searchTransactionsSchema', () => {
  it('should accept empty filters', () => {
    expect(searchTransactionsSchema.safeParse({}).success).toBe(true);
  });

  it('should accept all filters', () => {
    const result = searchTransactionsSchema.safeParse({
      status: 'captured',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      amountMinCents: 100,
      amountMaxCents: 10000,
      cardLast4: '1111',
      customerId: 'cust-1',
      orderId: 'order-1',
      locationId: 'loc-1',
      cursor: 'cursor-abc',
      limit: 50,
    });
    expect(result.success).toBe(true);
  });

  it('should default limit to 25', () => {
    const parsed = searchTransactionsSchema.parse({});
    expect(parsed.limit).toBe(25);
  });

  it('should reject limit over 100', () => {
    expect(
      searchTransactionsSchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
  });

  it('should accept negative amountMinCents (no floor constraint)', () => {
    // The schema uses z.number().int().optional() with no .min() constraint
    expect(
      searchTransactionsSchema.safeParse({ amountMinCents: -1 }).success,
    ).toBe(true);
  });

  it('should reject non-integer amountMinCents', () => {
    expect(
      searchTransactionsSchema.safeParse({ amountMinCents: 10.5 }).success,
    ).toBe(false);
  });
});
