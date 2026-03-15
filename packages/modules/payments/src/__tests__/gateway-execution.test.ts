import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const state = {
    existingIntent: null as any,
    createdIntent: null as any,
    updatedIntent: null as any,
    latestTxn: null as any,
    providerAuthorizeResponse: null as any,
    providerVoidResponse: null as any,
  };

  const publishWithOutbox = vi.fn();
  const buildEventFromContext = vi.fn();
  const auditLogDeferred = vi.fn();
  const resolveProvider = vi.fn();
  const interpretResponse = vi.fn();
  const centsToDollars = vi.fn();
  const dollarsToCents = vi.fn();
  const generateProviderOrderId = vi.fn();
  const extractCardLast4 = vi.fn();
  const detectCardBrand = vi.fn();
  const assertIntentTransition = vi.fn();

  return {
    state,
    publishWithOutbox,
    buildEventFromContext,
    auditLogDeferred,
    resolveProvider,
    interpretResponse,
    centsToDollars,
    dollarsToCents,
    generateProviderOrderId,
    extractCardLast4,
    detectCardBrand,
    assertIntentTransition,
  };
});

// ── vi.mock declarations ───────────────────────────────────────────
vi.mock('@oppsera/db', () => ({
  paymentIntents: {
    tenantId: 'tenant_id',
    id: 'id',
    idempotencyKey: 'idempotency_key',
    status: 'status',
    locationId: 'location_id',
  },
  paymentTransactions: {
    tenantId: 'tenant_id',
    paymentIntentId: 'payment_intent_id',
    createdAt: 'created_at',
  },
  // withTenant(tenantId, fn) — delegates to fn with a lightweight mock tx
  // The actual rows returned depend on state set up per test.
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown[]>) => {
    // Build a minimal select-chain mock that returns mocks.state.existingIntent's locationId
    const chainResult = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        if (mocks.state.existingIntent) {
          return Promise.resolve([{ locationId: mocks.state.existingIntent.locationId }]);
        }
        return Promise.resolve([]);
      }),
    };
    return fn(chainResult);
  }),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn((col) => ({ type: 'desc', col })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._: unknown[]) => strings.join(''),
    { raw: (s: string) => s },
  ),
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: mocks.publishWithOutbox,
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: mocks.buildEventFromContext,
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: mocks.auditLogDeferred,
  auditLogDeferred: mocks.auditLogDeferred,
}));

vi.mock('@oppsera/shared', () => ({
  AppError: class extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, status = 400) {
      super(message);
      this.code = code;
      this.statusCode = status;
    }
  },
}));

vi.mock('../helpers/resolve-provider', () => ({
  resolveProvider: mocks.resolveProvider,
}));

vi.mock('../helpers/amount', () => ({
  centsToDollars: mocks.centsToDollars,
  dollarsToCents: mocks.dollarsToCents,
  generateProviderOrderId: mocks.generateProviderOrderId,
  extractCardLast4: mocks.extractCardLast4,
  detectCardBrand: mocks.detectCardBrand,
}));

vi.mock('../services/response-interpreter', () => ({
  interpretResponse: mocks.interpretResponse,
}));

vi.mock('../events/gateway-types', () => ({
  PAYMENT_GATEWAY_EVENTS: {
    AUTHORIZED: 'payment.gateway.authorized.v1',
    CAPTURED: 'payment.gateway.captured.v1',
    VOIDED: 'payment.gateway.voided.v1',
    REFUNDED: 'payment.gateway.refunded.v1',
    DECLINED: 'payment.gateway.declined.v1',
    SETTLED: 'payment.gateway.settled.v1',
    CHARGEBACK_RECEIVED: 'payment.gateway.chargeback_received.v1',
    CARD_UPDATED: 'payment.gateway.card_updated.v1',
    PROFILE_CREATED: 'payment.gateway.profile_created.v1',
    PROFILE_DELETED: 'payment.gateway.profile_deleted.v1',
    ACH_ORIGINATED: 'payment.gateway.ach_originated.v1',
    ACH_SETTLED: 'payment.gateway.ach_settled.v1',
    ACH_RETURNED: 'payment.gateway.ach_returned.v1',
  },
  assertIntentTransition: mocks.assertIntentTransition,
}));

// CardPointeTimeoutError must NOT be thrown in the default paths tested here
vi.mock('../providers/cardpointe/client', () => ({
  CardPointeTimeoutError: class CardPointeTimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'CardPointeTimeoutError';
    }
  },
}));

// ── Helpers ────────────────────────────────────────────────────────
function makeIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intent-1',
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    status: 'created',
    amountCents: 5000,
    currency: 'USD',
    authorizedAmountCents: null,
    capturedAmountCents: null,
    refundedAmountCents: null,
    orderId: 'order-1',
    customerId: undefined,
    cardLast4: '4242',
    cardBrand: 'visa',
    errorMessage: null,
    idempotencyKey: 'idem-001',
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

function makeInterpretation(overrides: Record<string, unknown> = {}) {
  return {
    declineCategory: 'approved',
    userMessage: 'Transaction approved.',
    operatorMessage: '[Approved]',
    suggestedAction: 'none',
    retryable: false,
    avsResult: null,
    cvvResult: null,
    visaDeclineCategory: null,
    mcAdviceCode: null,
    processor: 'PPS',
    ...overrides,
  };
}

/**
 * createMockTx for authorizePayment:
 *
 * select call order:
 *   1st from() → idempotency check (paymentIntents) → .limit(1) resolves
 *   2nd insert → create intent → .returning() resolves
 *   3rd insert → payment transaction → (no returning, just values)
 *   4th update → update intent status → .returning() resolves
 *
 * The tx uses a select call counter to route .limit() responses.
 */
function createAuthorizeMockTx() {
  let selectCallCount = 0;

  const tx: Record<string, unknown> = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn(function (this: typeof tx) {
      selectCallCount++;
      return this;
    }),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn(function (this: typeof tx) {
      // call 1: idempotency check on paymentIntents
      if (selectCallCount === 1) {
        return Promise.resolve(
          mocks.state.existingIntent ? [mocks.state.existingIntent] : [],
        );
      }
      return Promise.resolve([]);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(function (this: typeof tx) {
      // returning() is called for:
      //   - insert(paymentIntents).values().returning() → created intent
      //   - update(paymentIntents).set().where().returning() → updated intent
      // We distinguish by checking which mock sequence we're in via createdIntent sentinel.
      if (!mocks.state.createdIntent._inserted) {
        mocks.state.createdIntent._inserted = true;
        return Promise.resolve([mocks.state.createdIntent]);
      }
      return Promise.resolve([mocks.state.updatedIntent]);
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };

  return tx;
}

/**
 * createMockTx for voidPayment:
 *
 * call order inside the transaction:
 *   tx.execute(sql`... FOR UPDATE`) — row lock
 *   select().from(paymentIntents).where().limit(1) — load intent
 *   select().from(paymentTransactions).where().orderBy().limit(1) — latest providerRef
 *   insert(paymentTransactions).values() — record void txn
 *   update(paymentIntents).set().where().returning() — update status
 */
function createVoidMockTx() {
  let selectCallCount = 0;

  const tx: Record<string, unknown> = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn(function (this: typeof tx) {
      selectCallCount++;
      return this;
    }),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn(function (this: typeof tx) {
      if (selectCallCount === 1) {
        // load payment intent
        return Promise.resolve(
          mocks.state.existingIntent ? [mocks.state.existingIntent] : [],
        );
      }
      if (selectCallCount === 2) {
        // latest paymentTransaction (providerRef lookup)
        return Promise.resolve(
          mocks.state.latestTxn ? [mocks.state.latestTxn] : [],
        );
      }
      return Promise.resolve([]);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([mocks.state.updatedIntent]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };

  return tx;
}

function createCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: {
      id: 'user-1',
      email: 'test@test.com',
      name: 'Test',
      tenantId: 'tenant-1',
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    requestId: 'req-1',
    isPlatformAdmin: false,
    ...overrides,
  } as unknown as RequestContext;
}

const baseAuthorizeInput = {
  clientRequestId: 'idem-001',
  amountCents: 5000,
  currency: 'USD' as const,
  token: '9418594164541111',
  terminalId: 'term-1',
  paymentMethodType: 'card' as const,
  orderId: 'order-1',
  customerId: undefined,
  surchargeAmountCents: 0,
  ecomind: 'E' as const,
};

const baseVoidInput = {
  clientRequestId: 'idem-void-001',
  paymentIntentId: 'intent-1',
};

// ── Imports (after all mocks) ──────────────────────────────────────
import { authorizePayment } from '../commands/authorize';
import { voidPayment } from '../commands/void-payment';

// ── authorizePayment tests ─────────────────────────────────────────
describe('authorizePayment', () => {
  beforeEach(() => {
    mocks.publishWithOutbox.mockReset();
    mocks.buildEventFromContext.mockReset();
    mocks.auditLogDeferred.mockReset();
    mocks.resolveProvider.mockReset();
    mocks.interpretResponse.mockReset();
    mocks.centsToDollars.mockReset();
    mocks.dollarsToCents.mockReset();
    mocks.generateProviderOrderId.mockReset();
    mocks.extractCardLast4.mockReset();
    mocks.detectCardBrand.mockReset();
    mocks.assertIntentTransition.mockReset();

    // Reset state
    mocks.state.existingIntent = null;
    mocks.state.createdIntent = makeIntent({ _inserted: false });
    mocks.state.updatedIntent = makeIntent({ status: 'authorized', authorizedAmountCents: 5000 });
    mocks.state.providerAuthorizeResponse = {
      providerRef: 'ref-123',
      status: 'approved',
      authCode: 'AUTH001',
      responseCode: '00',
      responseText: 'Approval',
      avsResponse: 'Y',
      cvvResponse: 'M',
      rawResponse: { respstat: 'A', respproc: 'PPS' },
      cardLast4: '1111',
      cardBrand: 'visa',
      amount: '50.00',
    };

    const mockProvider = {
      authorize: vi.fn().mockImplementation(async () => mocks.state.providerAuthorizeResponse),
      void: vi.fn(),
      inquireByOrderId: vi.fn(),
      voidByOrderId: vi.fn(),
    };

    mocks.resolveProvider.mockResolvedValue({
      provider: mockProvider,
      providerId: 'provider-1',
      merchantAccountId: 'ma-1',
      merchantId: 'MID-001',
    });

    mocks.generateProviderOrderId.mockReturnValue('ORDERID12345678');
    mocks.centsToDollars.mockReturnValue('50.00');
    mocks.dollarsToCents.mockReturnValue(5000);
    mocks.extractCardLast4.mockReturnValue('1111');
    mocks.detectCardBrand.mockReturnValue('visa');
    mocks.assertIntentTransition.mockReturnValue(undefined);

    mocks.interpretResponse.mockReturnValue(makeInterpretation());

    mocks.buildEventFromContext.mockImplementation((_ctx: unknown, eventType: string, data: unknown) => ({
      eventId: 'evt-1',
      eventType,
      data,
    }));

    mocks.auditLogDeferred.mockResolvedValue(undefined);

    // Default publishWithOutbox: creates a fresh authorize tx and invokes fn
    mocks.publishWithOutbox.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => Promise<{ result: unknown; events: unknown[] }>) => {
      const mockTx = createAuthorizeMockTx();
      const { result } = await fn(mockTx);
      return result;
    });
  });

  it('throws LOCATION_REQUIRED when locationId is missing', async () => {
    const ctx = createCtx({ locationId: undefined });
    await expect(authorizePayment(ctx, baseAuthorizeInput)).rejects.toMatchObject({
      code: 'LOCATION_REQUIRED',
      statusCode: 400,
    });
    expect(mocks.resolveProvider).not.toHaveBeenCalled();
  });

  it('returns existing intent on duplicate idempotency key', async () => {
    const existingAuthorized = makeIntent({ status: 'authorized', authorizedAmountCents: 5000 });
    mocks.state.existingIntent = existingAuthorized;

    const ctx = createCtx();
    const result = await authorizePayment(ctx, baseAuthorizeInput);

    // Should return the existing intent mapped — no new insert, no provider call
    expect(result.id).toBe('intent-1');
    expect(result.status).toBe('authorized');

    // Provider authorize should NOT have been called (early return)
    const { provider } = await mocks.resolveProvider.mock.results[0]?.value ?? {};
    if (provider) {
      expect(provider.authorize).not.toHaveBeenCalled();
    }
  });

  it('happy path — approved authorization emits AUTHORIZED event and returns authorized status', async () => {
    const ctx = createCtx();
    const result = await authorizePayment(ctx, baseAuthorizeInput);

    expect(result.status).toBe('authorized');
    expect(mocks.buildEventFromContext).toHaveBeenCalledWith(
      ctx,
      'payment.gateway.authorized.v1',
      expect.objectContaining({
        paymentIntentId: 'intent-1',
        amountCents: 5000,
        providerRef: 'ref-123',
      }),
    );
    expect(mocks.auditLogDeferred).toHaveBeenCalledWith(
      ctx,
      'payment.authorized',
      'payment_intent',
      'intent-1',
    );
  });

  it('declined — provider returns declined status, intent is declined, DECLINED event emitted', async () => {
    mocks.state.providerAuthorizeResponse = {
      providerRef: null,
      status: 'declined',
      authCode: null,
      responseCode: '05',
      responseText: 'Do not honour',
      avsResponse: null,
      cvvResponse: null,
      rawResponse: { respstat: 'C', respproc: 'PPS' },
      cardLast4: null,
      cardBrand: null,
      amount: '0.00',
    };
    mocks.state.updatedIntent = makeIntent({ status: 'declined', errorMessage: 'Do not honour' });
    mocks.interpretResponse.mockReturnValue(
      makeInterpretation({
        declineCategory: 'hard',
        userMessage: 'Your card was declined.',
        suggestedAction: 'try_different_card',
        retryable: false,
      }),
    );

    const ctx = createCtx();
    const result = await authorizePayment(ctx, baseAuthorizeInput);

    expect(result.status).toBe('declined');
    expect(mocks.buildEventFromContext).toHaveBeenCalledWith(
      ctx,
      'payment.gateway.declined.v1',
      expect.objectContaining({
        paymentIntentId: 'intent-1',
        amountCents: 5000,
      }),
    );
  });

  it('provider error — non-timeout error sets intent to error status', async () => {
    // Make provider.authorize throw a generic Error
    const { provider } = await mocks.resolveProvider();
    provider.authorize.mockRejectedValue(new Error('Connection refused'));

    mocks.state.updatedIntent = makeIntent({ status: 'error', errorMessage: 'Connection refused' });

    // Re-resolve so the mock returns a provider with the rejection set up
    mocks.resolveProvider.mockResolvedValue({
      provider,
      providerId: 'provider-1',
      merchantAccountId: 'ma-1',
      merchantId: 'MID-001',
    });

    const ctx = createCtx();
    const result = await authorizePayment(ctx, baseAuthorizeInput);

    expect(result.status).toBe('error');
    // For txnStatus='error', no event is emitted — source only builds events for 'approved' or 'declined'
    expect(mocks.buildEventFromContext).not.toHaveBeenCalled();
  });
});

// ── voidPayment tests ──────────────────────────────────────────────
describe('voidPayment', () => {
  beforeEach(() => {
    mocks.publishWithOutbox.mockReset();
    mocks.buildEventFromContext.mockReset();
    mocks.auditLogDeferred.mockReset();
    mocks.resolveProvider.mockReset();
    mocks.interpretResponse.mockReset();
    mocks.assertIntentTransition.mockReset();

    // Reset state
    mocks.state.existingIntent = makeIntent({ status: 'authorized' });
    mocks.state.latestTxn = { providerRef: 'ref-123', id: 'txn-1' };
    mocks.state.updatedIntent = makeIntent({ status: 'voided' });
    mocks.state.providerVoidResponse = {
      providerRef: 'ref-void-1',
      status: 'approved',
      responseCode: '00',
      responseText: 'Void approved',
      rawResponse: { respstat: 'A', respproc: 'PPS' },
    };

    const mockProvider = {
      authorize: vi.fn(),
      void: vi.fn().mockImplementation(async () => mocks.state.providerVoidResponse),
      inquireByOrderId: vi.fn(),
      voidByOrderId: vi.fn(),
    };

    mocks.resolveProvider.mockResolvedValue({
      provider: mockProvider,
      providerId: 'provider-1',
      merchantAccountId: 'ma-1',
      merchantId: 'MID-001',
    });

    mocks.assertIntentTransition.mockReturnValue(undefined);
    mocks.interpretResponse.mockReturnValue(makeInterpretation());

    mocks.buildEventFromContext.mockImplementation((_ctx: unknown, eventType: string, data: unknown) => ({
      eventId: 'evt-1',
      eventType,
      data,
    }));

    mocks.auditLogDeferred.mockResolvedValue(undefined);

    mocks.publishWithOutbox.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => Promise<{ result: unknown; events: unknown[] }>) => {
      const mockTx = createVoidMockTx();
      const { result } = await fn(mockTx);
      return result;
    });
  });

  it('throws LOCATION_REQUIRED when locationId is missing', async () => {
    const ctx = createCtx({ locationId: undefined });
    await expect(voidPayment(ctx, baseVoidInput)).rejects.toMatchObject({
      code: 'LOCATION_REQUIRED',
      statusCode: 400,
    });
  });

  it('throws PAYMENT_INTENT_NOT_FOUND when intent does not exist', async () => {
    mocks.state.existingIntent = null;

    const ctx = createCtx();
    await expect(voidPayment(ctx, baseVoidInput)).rejects.toMatchObject({
      code: 'PAYMENT_INTENT_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('returns idempotent result when intent is already voided (no events emitted)', async () => {
    mocks.state.existingIntent = makeIntent({ status: 'voided' });

    const ctx = createCtx();
    const result = await voidPayment(ctx, baseVoidInput);

    expect(result.status).toBe('voided');
    expect(mocks.buildEventFromContext).not.toHaveBeenCalled();
    expect(mocks.assertIntentTransition).not.toHaveBeenCalled();
  });

  it('happy path — authorized intent voided successfully, VOIDED event emitted', async () => {
    const ctx = createCtx();
    const result = await voidPayment(ctx, baseVoidInput);

    expect(result.status).toBe('voided');
    expect(mocks.buildEventFromContext).toHaveBeenCalledWith(
      ctx,
      'payment.gateway.voided.v1',
      expect.objectContaining({
        paymentIntentId: 'intent-1',
        amountCents: 5000,
        providerRef: 'ref-void-1',
      }),
    );
    expect(mocks.auditLogDeferred).toHaveBeenCalledWith(
      ctx,
      'payment.voided',
      'payment_intent',
      'intent-1',
    );
    expect(mocks.assertIntentTransition).toHaveBeenCalledWith('authorized', 'voided');
  });

  it('failed void — provider returns non-approved status, intent set to error, no VOIDED event', async () => {
    mocks.state.providerVoidResponse = {
      providerRef: null,
      status: 'declined',
      responseCode: '91',
      responseText: 'Issuer unavailable',
      rawResponse: { respstat: 'B', respproc: 'PPS' },
    };
    mocks.state.updatedIntent = makeIntent({ status: 'error', errorMessage: 'Issuer unavailable' });
    mocks.interpretResponse.mockReturnValue(
      makeInterpretation({
        declineCategory: 'soft',
        userMessage: 'Please try again.',
        suggestedAction: 'retry_later',
        retryable: true,
      }),
    );

    const ctx = createCtx();
    const result = await voidPayment(ctx, baseVoidInput);

    expect(result.status).toBe('error');
    expect(mocks.buildEventFromContext).not.toHaveBeenCalled();
  });
});
