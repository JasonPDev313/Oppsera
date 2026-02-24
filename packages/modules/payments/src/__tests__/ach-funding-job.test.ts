import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Hoisted mocks ─────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file, so any variables
// referenced inside them must be created via vi.hoisted().

const mocks = vi.hoisted(() => {
  const selectResults: any[][] = [];
  const selectCallIndex = 0;

  const mockInsertValues = vi.fn().mockReturnValue({
    returning: vi.fn().mockReturnValue([]),
  });
  const mockInsert = vi.fn().mockReturnValue({
    values: mockInsertValues,
  });
  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue([]),
      }),
    }),
  });

  const mockTx = {
    select: vi.fn(),
    insert: mockInsert,
    update: mockUpdate,
  };

  const mockGetFundingStatus = vi.fn();
  const mockProvider = {
    code: 'cardpointe',
    getFundingStatus: mockGetFundingStatus,
  };

  const mockProcessAchReturn = vi.fn();

  return {
    selectResults,
    selectCallIndex,
    mockInsertValues,
    mockInsert,
    mockUpdate,
    mockTx,
    mockGetFundingStatus,
    mockProvider,
    mockProcessAchReturn,

    // Helper to set select results per test
    setupSelectResults(...results: any[][]) {
      mocks.selectResults = results;
      mocks.selectCallIndex = 0;
    },

    // Helper to build a select chain that supports both .limit() and direct .where() usage
    makeSelectChain() {
      const idx = mocks.selectCallIndex++;
      const result = mocks.selectResults[idx] ?? [];
      const whereResult = Object.assign([...result], {
        limit: vi.fn().mockReturnValue(result),
        orderBy: vi.fn().mockReturnValue(result),
      });
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(whereResult),
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue(whereResult),
          }),
        }),
      };
    },
  };
});

// ── vi.mock declarations ──────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: (...args: any[]) => any) => fn(mocks.mockTx)),
  paymentProviders: { tenantId: 'tenant_id', isActive: 'is_active', id: 'id', code: 'code' },
  paymentProviderCredentials: {
    tenantId: 'tenant_id',
    providerId: 'provider_id',
    locationId: 'location_id',
    isActive: 'is_active',
    credentialsEncrypted: 'credentials_encrypted',
  },
  paymentMerchantAccounts: {
    tenantId: 'tenant_id',
    providerId: 'provider_id',
    isActive: 'is_active',
    achEnabled: 'ach_enabled',
    id: 'id',
    merchantId: 'merchant_id',
    locationId: 'location_id',
    displayName: 'display_name',
  },
  paymentIntents: {
    tenantId: 'tenant_id',
    id: 'id',
    status: 'status',
    paymentMethodType: 'payment_method_type',
    locationId: 'location_id',
    amountCents: 'amount_cents',
    currency: 'currency',
    orderId: 'order_id',
    customerId: 'customer_id',
    merchantAccountId: 'merchant_account_id',
    achSecCode: 'ach_sec_code',
    achAccountType: 'ach_account_type',
    bankLast4: 'bank_last4',
    achSettlementStatus: 'ach_settlement_status',
    achSettledAt: 'ach_settled_at',
    achReturnCode: 'ach_return_code',
    achReturnReason: 'ach_return_reason',
    errorMessage: 'error_message',
    updatedAt: 'updated_at',
  },
  paymentTransactions: {
    tenantId: 'tenant_id',
    providerRef: 'provider_ref',
    paymentIntentId: 'payment_intent_id',
  },
  paymentWebhookEvents: {
    tenantId: 'tenant_id',
    providerCode: 'provider_code',
    eventId: 'event_id',
    id: 'id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((col) => ({ type: 'isNull', col })),
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn((_ctx: any, fn: (...args: any[]) => any) => fn(mocks.mockTx)),
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

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ulid-123'),
}));

vi.mock('../providers/registry', () => ({
  providerRegistry: {
    get: vi.fn(() => mocks.mockProvider),
  },
}));

vi.mock('../helpers/credentials', () => ({
  decryptCredentials: vi.fn(() => ({
    site: 'test-site',
    username: 'test-user',
    password: 'test-pass',
  })),
}));

vi.mock('../commands/process-ach-return', () => ({
  processAchReturn: mocks.mockProcessAchReturn,
}));

// ── Imports (after mocks) ───────────────────────────────────

import { pollAchFunding } from '../jobs/poll-ach-funding';
import { providerRegistry } from '../providers/registry';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';

// ── Test Fixtures ───────────────────────────────────────────

const baseCtx: RequestContext = {
  tenantId: 'tenant-1',
  locationId: 'loc-1',
  user: { id: 'user-1', email: 'admin@test.com', role: 'admin' },
  requestId: 'req-1',
} as any;

const providerRow = {
  id: 'provider-1',
  tenantId: 'tenant-1',
  code: 'cardpointe',
  isActive: true,
};

const credsRow = {
  credentialsEncrypted: 'encrypted-blob',
};

const merchantAccount = {
  id: 'ma-1',
  merchantId: 'MID123',
  locationId: 'loc-1',
  displayName: 'Main Terminal',
};

const merchantAccount2 = {
  id: 'ma-2',
  merchantId: 'MID456',
  locationId: 'loc-2',
  displayName: 'Secondary Terminal',
};

const achIntent = {
  id: 'intent-1',
  tenantId: 'tenant-1',
  status: 'ach_originated',
  paymentMethodType: 'ach',
  locationId: 'loc-1',
  amountCents: 5000,
  currency: 'USD',
  orderId: 'order-1',
  customerId: 'cust-1',
  merchantAccountId: 'ma-1',
  achSecCode: 'WEB',
  achAccountType: 'ECHK',
  bankLast4: '7890',
};

const pendingIntent = {
  ...achIntent,
  id: 'intent-pending',
  status: 'ach_pending',
};

// ── Tests ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectResults = [];
  mocks.selectCallIndex = 0;
  mocks.mockGetFundingStatus.mockReset();
  mocks.mockProcessAchReturn.mockReset();

  // Re-setup the mock select chain on each test.
  // select() is called sequentially; each call consumes the next entry from selectResults.
  mocks.mockTx.select.mockImplementation(() => mocks.makeSelectChain());
});

describe('pollAchFunding', () => {
  // ── buildDateList behavior (tested indirectly) ──────────────

  describe('date handling', () => {
    it('uses specific date when provided (not lookback)', async () => {
      mocks.setupSelectResults(
        [],  // no provider — returns early, but proves only 1 date would be polled
      );

      await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(mocks.mockTx.select).toHaveBeenCalled();
    });

    it('defaults lookback to 1 day (yesterday) when no date provided', async () => {
      mocks.setupSelectResults(
        [providerRow],       // 0: provider
        [credsRow],          // 1: credentials
        [merchantAccount],   // 2: merchant accounts
        [],                  // 3: idempotency check for date[0]
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-23',
        fundingTransactions: [],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
      });

      // With lookbackDays=1 and no date, should poll once (yesterday)
      expect(mocks.mockGetFundingStatus).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
    });

    it('multiple lookback days generates multiple date polls', async () => {
      // For 3 lookback days, we need 3 idempotency checks
      mocks.setupSelectResults(
        [providerRow],       // 0: provider
        [credsRow],          // 1: credentials
        [merchantAccount],   // 2: merchant accounts
        [],                  // 3: idempotency for date[0]
        [],                  // 4: idempotency for date[1]
        [],                  // 5: idempotency for date[2]
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-23',
        fundingTransactions: [],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        lookbackDays: 3,
      });

      expect(mocks.mockGetFundingStatus).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
    });
  });

  // ── Provider/credentials resolution ─────────────────────────

  describe('provider resolution', () => {
    it('returns empty when no active provider found', async () => {
      mocks.setupSelectResults(
        [],  // no provider
      );

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results).toEqual([]);
      expect(mocks.selectCallIndex).toBe(1);
    });

    it('returns empty when no credentials found', async () => {
      mocks.setupSelectResults(
        [providerRow],  // provider found
        [],             // no credentials
      );

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results).toEqual([]);
      expect(mocks.selectCallIndex).toBe(2);
    });

    it('returns empty when no ACH-enabled merchant accounts', async () => {
      mocks.setupSelectResults(
        [providerRow],  // provider found
        [credsRow],     // credentials found
        [],             // no merchant accounts
      );

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results).toEqual([]);
      expect(mocks.selectCallIndex).toBe(3);
    });

    it('warns when provider does not support getFundingStatus', async () => {
      (providerRegistry.get as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        code: 'no-funding',
        // getFundingStatus is intentionally missing
      });

      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('does not support getFundingStatus'),
      );
      expect(results).toEqual([]);
      consoleSpy.mockRestore();
    });
  });

  // ── Idempotency ─────────────────────────────────────────────

  describe('idempotency', () => {
    it('skips date+MID combination that was already processed', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [{ id: 'existing-webhook-1' }],   // already processed
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [{ providerRef: 'ref-1', fundingStatus: 'settled' }],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      // Batch was already processed — no result pushed
      expect(results).toEqual([]);
    });

    it('records webhook event after successful processing', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],   // no existing webhook (new batch)
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [],
        rawResponse: { raw: 'data' },
      });

      await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(mocks.mockInsert).toHaveBeenCalled();
      expect(mocks.mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ulid-123',
          tenantId: 'tenant-1',
          providerCode: 'cardpointe',
          eventId: 'ach-funding-MID123-2026-02-20',
          eventType: 'ach_funding_poll',
          payload: { raw: 'data' },
        }),
      );
    });
  });

  // ── Transaction matching ────────────────────────────────────

  describe('transaction matching', () => {
    it('skips transactions with no matching providerRef', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],   // no existing webhook
        [],   // no matching transaction for providerRef
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'unknown-ref',
            amount: '50.00',
            fundingStatus: 'settled',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: 'batch-1',
          },
        ],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.skippedCount).toBe(1);
      expect(results[0]!.settledCount).toBe(0);
    });

    it('skips transactions for non-ACH payment intents', async () => {
      const cardIntent = { ...achIntent, paymentMethodType: 'card' };

      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [cardIntent],
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'settled',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: 'batch-1',
          },
        ],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.skippedCount).toBe(1);
    });

    it('processes matching ACH transactions correctly', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [achIntent],
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'settled',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: 'batch-1',
          },
        ],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.settledCount).toBe(1);
      expect(results[0]!.skippedCount).toBe(0);
    });
  });

  // ── Return processing ───────────────────────────────────────

  describe('return processing', () => {
    it('calls processAchReturn for returned funding status', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [achIntent],
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'returned',
            achReturnCode: 'R01',
            achReturnDescription: 'Insufficient funds',
            fundingDate: '2026-02-20',
            batchId: 'batch-1',
          },
        ],
        rawResponse: {},
      });

      mocks.mockProcessAchReturn.mockResolvedValue({
        achReturnId: 'return-1',
        paymentIntentId: 'intent-1',
        returnCode: 'R01',
        returnReason: 'Insufficient funds',
        isRetryable: true,
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(mocks.mockProcessAchReturn).toHaveBeenCalledWith(baseCtx, {
        paymentIntentId: 'intent-1',
        returnCode: 'R01',
        returnReason: 'Insufficient funds',
        returnDate: '2026-02-20',
        providerRef: 'ref-1',
        fundingBatchId: 'batch-1',
      });
      expect(results[0]!.returnedCount).toBe(1);
    });

    it('calls processAchReturn for rejected funding status', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [achIntent],
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'rejected',
            achReturnCode: 'R03',
            achReturnDescription: 'No account',
            fundingDate: '2026-02-20',
            batchId: null,
          },
        ],
        rawResponse: {},
      });

      mocks.mockProcessAchReturn.mockResolvedValue({
        achReturnId: 'return-2',
        paymentIntentId: 'intent-1',
        returnCode: 'R03',
        returnReason: 'No account',
        isRetryable: false,
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(mocks.mockProcessAchReturn).toHaveBeenCalledWith(baseCtx, {
        paymentIntentId: 'intent-1',
        returnCode: 'R03',
        returnReason: 'No account',
        returnDate: '2026-02-20',
        providerRef: 'ref-1',
        fundingBatchId: undefined, // batchId was null -> ?? undefined
      });
      expect(results[0]!.returnedCount).toBe(1);
    });

    it('skips return without achReturnCode and warns', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [achIntent],
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'returned',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: null,
          },
        ],
        rawResponse: {},
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Return without code'),
      );
      expect(mocks.mockProcessAchReturn).not.toHaveBeenCalled();
      expect(results[0]!.skippedCount).toBe(1);
      consoleSpy.mockRestore();
    });
  });

  // ── Settlement processing ───────────────────────────────────

  describe('settlement processing', () => {
    it('updates intent to ach_settled and emits ACH_SETTLED event', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [achIntent],   // status: ach_originated -> ach_settled is valid
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'settled',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: 'batch-1',
          },
        ],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results[0]!.settledCount).toBe(1);
      expect(publishWithOutbox).toHaveBeenCalled();
      expect(buildEventFromContext).toHaveBeenCalledWith(
        baseCtx,
        'payment.gateway.ach_settled.v1',
        expect.objectContaining({
          paymentIntentId: 'intent-1',
          tenantId: 'tenant-1',
          merchantAccountId: 'ma-1',
          amountCents: 5000,
          fundingDate: '2026-02-20',
          providerRef: 'ref-1',
        }),
      );
      expect(auditLog).toHaveBeenCalledWith(
        baseCtx,
        'payment.ach.settled',
        'payment_intent',
        'intent-1',
      );
    });

    it('skips settlement if intent already ach_settled', async () => {
      const settledIntent = { ...achIntent, status: 'ach_settled' };

      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [settledIntent],
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'settled',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: null,
          },
        ],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results[0]!.skippedCount).toBe(1);
      expect(results[0]!.settledCount).toBe(0);
      expect(publishWithOutbox).not.toHaveBeenCalled();
    });

    it('skips settlement if intent already ach_returned', async () => {
      const returnedIntent = { ...achIntent, status: 'ach_returned' };

      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [returnedIntent],
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'settled',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: null,
          },
        ],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results[0]!.skippedCount).toBe(1);
      expect(results[0]!.settledCount).toBe(0);
    });

    it('skips settlement if transition is invalid', async () => {
      // voided -> ach_settled is not a valid transition
      const voidedIntent = { ...achIntent, status: 'voided' };

      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [voidedIntent],
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'settled',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: null,
          },
        ],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results[0]!.skippedCount).toBe(1);
      expect(results[0]!.settledCount).toBe(0);
    });
  });

  // ── Origination processing ──────────────────────────────────

  describe('origination processing', () => {
    it('updates intent to ach_originated and emits ACH_ORIGINATED event', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-pending' }],
        [pendingIntent],   // status: ach_pending -> ach_originated is valid
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-2',
            amount: '75.00',
            fundingStatus: 'originated',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: 'batch-2',
          },
        ],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results[0]!.originatedCount).toBe(1);
      expect(publishWithOutbox).toHaveBeenCalled();
      expect(buildEventFromContext).toHaveBeenCalledWith(
        baseCtx,
        'payment.gateway.ach_originated.v1',
        expect.objectContaining({
          paymentIntentId: 'intent-pending',
          tenantId: 'tenant-1',
          amountCents: 5000,
          providerRef: 'ref-2',
          achSecCode: 'WEB',
          achAccountType: 'ECHK',
          bankLast4: '7890',
        }),
      );
      expect(auditLog).toHaveBeenCalledWith(
        baseCtx,
        'payment.ach.originated',
        'payment_intent',
        'intent-pending',
      );
    });

    it('skips origination if intent not in ach_pending status', async () => {
      // ach_originated is not ach_pending — should skip
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [achIntent],   // status: ach_originated (not ach_pending)
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'originated',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: null,
          },
        ],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results[0]!.skippedCount).toBe(1);
      expect(results[0]!.originatedCount).toBe(0);
    });
  });

  // ── Error handling ──────────────────────────────────────────

  describe('error handling', () => {
    it('catches transaction processing errors and increments skippedCount', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [achIntent],
      );

      // Make publishWithOutbox throw for this test
      (publishWithOutbox as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('DB write failed'),
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'settled',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: null,
          },
        ],
        rawResponse: {},
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process transaction ref-1'),
        expect.any(Error),
      );
      expect(results[0]!.skippedCount).toBe(1);
      expect(results[0]!.settledCount).toBe(0);
      consoleSpy.mockRestore();
    });

    it('catches MID/date level errors and continues to next', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
      );

      mocks.mockGetFundingStatus.mockRejectedValue(new Error('Provider API down'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to poll MID MID123 for 2026-02-20'),
        expect.any(Error),
      );
      expect(results).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('unknown funding status returns skipped', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        [{ intentId: 'intent-1' }],
        [achIntent],
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-1',
            amount: '50.00',
            fundingStatus: 'pending_review' as any,
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: null,
          },
        ],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results[0]!.skippedCount).toBe(1);
    });
  });

  // ── Result aggregation ──────────────────────────────────────

  describe('result aggregation', () => {
    it('correctly counts settled/originated/returned/skipped', async () => {
      // 4 transactions: 1 settled, 1 originated, 1 returned, 1 unknown
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],
        // Transaction 1 (settled): providerRef match + intent load
        [{ intentId: 'intent-1' }],
        [achIntent],   // ach_originated -> ach_settled valid
        // Transaction 2 (originated): providerRef match + intent load
        [{ intentId: 'intent-pending' }],
        [pendingIntent],  // ach_pending -> ach_originated valid
        // Transaction 3 (returned): providerRef match + intent load
        [{ intentId: 'intent-1' }],
        [achIntent],
        // Transaction 4 (unknown): providerRef match + intent load
        [{ intentId: 'intent-1' }],
        [achIntent],
      );

      mocks.mockProcessAchReturn.mockResolvedValue({
        achReturnId: 'return-1',
        paymentIntentId: 'intent-1',
        returnCode: 'R01',
        returnReason: 'Insufficient funds',
        isRetryable: true,
      });

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [
          {
            providerRef: 'ref-settled',
            amount: '50.00',
            fundingStatus: 'settled',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: 'b1',
          },
          {
            providerRef: 'ref-originated',
            amount: '75.00',
            fundingStatus: 'originated',
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: 'b2',
          },
          {
            providerRef: 'ref-returned',
            amount: '25.00',
            fundingStatus: 'returned',
            achReturnCode: 'R01',
            achReturnDescription: 'Insufficient funds',
            fundingDate: '2026-02-20',
            batchId: 'b3',
          },
          {
            providerRef: 'ref-unknown',
            amount: '10.00',
            fundingStatus: 'pending_review' as any,
            achReturnCode: null,
            achReturnDescription: null,
            fundingDate: '2026-02-20',
            batchId: null,
          },
        ],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        merchantId: 'MID123',
        date: '2026-02-20',
        totalTransactions: 4,
        settledCount: 1,
        originatedCount: 1,
        returnedCount: 1,
        skippedCount: 1,
      });
    });

    it('returns results for multiple MIDs', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount, merchantAccount2],   // two merchant accounts
        [],   // idempotency check MID1
        [],   // idempotency check MID2
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID',
        date: '2026-02-20',
        fundingTransactions: [],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.merchantId).toBe('MID123');
      expect(results[1]!.merchantId).toBe('MID456');
      expect(mocks.mockGetFundingStatus).toHaveBeenCalledTimes(2);
    });

    it('returns results for multiple dates (lookback)', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [merchantAccount],
        [],   // idempotency check date[0]
        [],   // idempotency check date[1]
      );

      mocks.mockGetFundingStatus.mockResolvedValue({
        merchantId: 'MID123',
        date: '2026-02-20',
        fundingTransactions: [],
        rawResponse: {},
      });

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        lookbackDays: 2,
      });

      expect(results).toHaveLength(2);
      expect(mocks.mockGetFundingStatus).toHaveBeenCalledTimes(2);
    });

    it('returns empty results when no merchant accounts', async () => {
      mocks.setupSelectResults(
        [providerRow],
        [credsRow],
        [],   // no merchant accounts
      );

      const results = await pollAchFunding(baseCtx, {
        tenantId: 'tenant-1',
        date: '2026-02-20',
      });

      expect(results).toEqual([]);
    });
  });
});
