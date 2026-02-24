import { describe, it, expect, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────

// Mock the DB module
vi.mock('@oppsera/db', () => {
  const mockTx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([]),
          orderBy: vi.fn().mockReturnValue([]),
        }),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([]),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue([{ id: 'intent-new', status: 'created', amountCents: 1000 }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue([{ id: 'intent-new', status: 'authorized', amountCents: 1000 }]),
        }),
      }),
    }),
  };

  return {
    withTenant: vi.fn((_tenantId: string, fn: (...args: any[]) => any) => fn(mockTx)),
    paymentIntents: { tenantId: 'tenant_id', id: 'id', idempotencyKey: 'idempotency_key', status: 'status' },
    paymentTransactions: { tenantId: 'tenant_id', paymentIntentId: 'payment_intent_id' },
    paymentProviders: {},
    paymentProviderCredentials: {},
    paymentMerchantAccounts: {},
    terminalMerchantAssignments: {},
  };
});

// Mock core dependencies
vi.mock('@oppsera/core', () => ({
  publishWithOutbox: vi.fn((_ctx: any, fn: (...args: any[]) => any) => fn({})),
  buildEventFromContext: vi.fn((_ctx: any, type: string, payload: any) => ({
    type,
    payload,
    id: 'event-1',
  })),
  auditLog: vi.fn(),
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn((_ctx: any, fn: (...args: any[]) => any) => fn({})),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx: any, type: string, payload: any) => ({
    type,
    payload,
    id: 'event-1',
  })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn(),
}));

// Mock the provider resolver
const mockProvider = {
  code: 'cardpointe',
  authorize: vi.fn(),
  capture: vi.fn(),
  sale: vi.fn(),
  void: vi.fn(),
  refund: vi.fn(),
  inquire: vi.fn(),
  inquireByOrderId: vi.fn(),
  tokenize: vi.fn(),
  createProfile: vi.fn(),
  getProfile: vi.fn(),
  deleteProfile: vi.fn(),
  getSettlementStatus: vi.fn(),
  captureSignature: vi.fn(),
  voidByOrderId: vi.fn(),
};

vi.mock('../helpers/resolve-provider', () => ({
  resolveProvider: vi.fn().mockResolvedValue({
    provider: mockProvider,
    providerId: 'provider-1',
    merchantAccountId: 'ma-1',
    merchantId: 'MID123',
  }),
}));

vi.mock('../helpers/amount', () => ({
  centsToDollars: (cents: number) => (cents / 100).toFixed(2),
  dollarsToCents: (dollars: string) => Math.round(parseFloat(dollars) * 100),
  generateProviderOrderId: () => 'PO-TEST-001',
  extractCardLast4: (token: string) => token ? token.slice(-4) : null,
  detectCardBrand: (token: string) => token?.startsWith('4') ? 'visa' : null,
}));

vi.mock('../providers/cardpointe/client', () => ({
  CardPointeTimeoutError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'CardPointeTimeoutError';
    }
  },
}));

// Mock the facade (retry command imports it)
vi.mock('../facade', () => ({
  paymentsFacade: {
    authorize: vi.fn(),
    capture: vi.fn(),
    sale: vi.fn(),
    void: vi.fn(),
    refund: vi.fn(),
  },
}));

// ── Imports (after mocks) ───────────────────────────────────

import {
  authorizePaymentSchema,
  salePaymentSchema,
  voidPaymentSchema,
  refundPaymentSchema,
  capturePaymentSchema,
} from '../gateway-validation';

import {
  centsToDollars,
  dollarsToCents,
  generateProviderOrderId,
  extractCardLast4,
  detectCardBrand,
} from '../helpers/amount';

import {
  assertIntentTransition,
} from '../events/gateway-types';

import { resolveFailedPaymentSchema } from '../commands/resolve-failed-payment';
import { retryFailedPaymentSchema } from '../commands/retry-failed-payment';

// ── Tests ────────────────────────────────────────────────────

describe('gateway-validation schemas (extended)', () => {
  it('authorize schema rejects amount of 0', () => {
    expect(
      authorizePaymentSchema.safeParse({
        clientRequestId: 'test',
        amountCents: 0,
        token: 'tok',
      }).success,
    ).toBe(false);
  });

  it('sale schema allows metadata', () => {
    const result = salePaymentSchema.safeParse({
      clientRequestId: 'sale-1',
      amountCents: 1000,
      token: 'tok',
      metadata: { orderId: 'test' },
    });
    expect(result.success).toBe(true);
  });

  it('void schema requires paymentIntentId', () => {
    expect(
      voidPaymentSchema.safeParse({
        clientRequestId: 'void-1',
      }).success,
    ).toBe(false);
  });

  it('refund schema allows partial amount', () => {
    const parsed = refundPaymentSchema.parse({
      clientRequestId: 'refund-1',
      paymentIntentId: 'intent-1',
      amountCents: 500,
    });
    expect(parsed.amountCents).toBe(500);
  });

  it('capture schema allows partial amount', () => {
    const parsed = capturePaymentSchema.parse({
      clientRequestId: 'cap-1',
      paymentIntentId: 'intent-1',
      amountCents: 2500,
    });
    expect(parsed.amountCents).toBe(2500);
  });
});

describe('provider interface shape', () => {
  it('mockProvider has all required methods', () => {
    expect(typeof mockProvider.authorize).toBe('function');
    expect(typeof mockProvider.capture).toBe('function');
    expect(typeof mockProvider.sale).toBe('function');
    expect(typeof mockProvider.void).toBe('function');
    expect(typeof mockProvider.refund).toBe('function');
    expect(typeof mockProvider.inquire).toBe('function');
    expect(typeof mockProvider.inquireByOrderId).toBe('function');
    expect(typeof mockProvider.tokenize).toBe('function');
    expect(typeof mockProvider.createProfile).toBe('function');
    expect(typeof mockProvider.getProfile).toBe('function');
    expect(typeof mockProvider.deleteProfile).toBe('function');
    expect(typeof mockProvider.getSettlementStatus).toBe('function');
    expect(typeof mockProvider.captureSignature).toBe('function');
    expect(typeof mockProvider.voidByOrderId).toBe('function');
  });
});

describe('amount helpers (mocked)', () => {
  it('centsToDollars converts correctly', () => {
    expect(centsToDollars(1000)).toBe('10.00');
    expect(centsToDollars(0)).toBe('0.00');
    expect(centsToDollars(50)).toBe('0.50');
    expect(centsToDollars(9999)).toBe('99.99');
  });

  it('dollarsToCents converts correctly', () => {
    expect(dollarsToCents('10.00')).toBe(1000);
    expect(dollarsToCents('0.50')).toBe(50);
    expect(dollarsToCents('99.99')).toBe(9999);
  });

  it('generateProviderOrderId returns string', () => {
    expect(typeof generateProviderOrderId()).toBe('string');
  });

  it('extractCardLast4 extracts last 4 digits', () => {
    expect(extractCardLast4('9418594164541111')).toBe('1111');
    expect(extractCardLast4(null as unknown as string)).toBeNull();
  });

  it('detectCardBrand identifies Visa', () => {
    expect(detectCardBrand('4111111111111111')).toBe('visa');
  });
});

describe('intent status transitions', () => {
  it('assertIntentTransition allows valid transitions', () => {
    // created → authorized
    expect(() => assertIntentTransition('created', 'authorized')).not.toThrow();
    // created → declined
    expect(() => assertIntentTransition('created', 'declined')).not.toThrow();
    // authorized → captured
    expect(() => assertIntentTransition('authorized', 'captured')).not.toThrow();
    // authorized → voided
    expect(() => assertIntentTransition('authorized', 'voided')).not.toThrow();
    // captured → voided
    expect(() => assertIntentTransition('captured', 'voided')).not.toThrow();
    // captured → refunded
    expect(() => assertIntentTransition('captured', 'refunded')).not.toThrow();
  });

  it('assertIntentTransition rejects invalid transitions', () => {
    // refunded → authorized (invalid)
    expect(() => assertIntentTransition('refunded', 'authorized')).toThrow();
    // voided → captured (invalid)
    expect(() => assertIntentTransition('voided', 'captured')).toThrow();
    // declined → captured (invalid)
    expect(() => assertIntentTransition('declined', 'captured')).toThrow();
  });
});

describe('resolve-failed-payment schema', () => {
  it('should accept valid resolve input', () => {
    const result = resolveFailedPaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
      resolution: 'resolved',
      reason: 'Customer paid with cash',
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid dismiss input', () => {
    const result = resolveFailedPaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
      resolution: 'dismissed',
      reason: 'Customer cancelled order',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty reason', () => {
    const result = resolveFailedPaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
      resolution: 'resolved',
      reason: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid resolution value', () => {
    const result = resolveFailedPaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
      resolution: 'cancelled',
      reason: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('should default paidByOtherMeans to false', () => {
    const parsed = resolveFailedPaymentSchema.parse({
      paymentIntentId: 'intent-1',
      resolution: 'resolved',
      reason: 'Paid with cash',
    });
    expect(parsed.paidByOtherMeans).toBe(false);
  });

  it('should accept otherMeansType when paidByOtherMeans is true', () => {
    const result = resolveFailedPaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
      resolution: 'resolved',
      reason: 'Paid with check',
      paidByOtherMeans: true,
      otherMeansType: 'check',
    });
    expect(result.success).toBe(true);
  });

  it('should reject reason over 500 chars', () => {
    const result = resolveFailedPaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
      resolution: 'resolved',
      reason: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('retry-failed-payment schema', () => {
  it('should accept valid retry with same card', () => {
    const result = retryFailedPaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
    });
    expect(result.success).toBe(true);
  });

  it('should accept retry with new token', () => {
    const result = retryFailedPaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
      token: '9418594164541111',
    });
    expect(result.success).toBe(true);
  });

  it('should accept retry with stored payment method', () => {
    const result = retryFailedPaymentSchema.safeParse({
      paymentIntentId: 'intent-1',
      paymentMethodId: 'pm-1',
    });
    expect(result.success).toBe(true);
  });

  it('should default paymentMethodType to card', () => {
    const parsed = retryFailedPaymentSchema.parse({
      paymentIntentId: 'intent-1',
    });
    expect(parsed.paymentMethodType).toBe('card');
  });

  it('should accept terminal payment method type', () => {
    const parsed = retryFailedPaymentSchema.parse({
      paymentIntentId: 'intent-1',
      paymentMethodType: 'terminal',
    });
    expect(parsed.paymentMethodType).toBe('terminal');
  });
});
