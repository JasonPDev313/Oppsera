import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const getAccountingSettings = vi.fn();
  const resolvePaymentTypeAccounts = vi.fn();
  const logUnmappedEvent = vi.fn();
  const postEntry = vi.fn().mockResolvedValue({ id: 'je-1', journalNumber: 1, status: 'posted' });
  const voidJournalEntry = vi.fn();

  // DB select chain — supports multiple sequential calls with different results
  let _queryResults: any[][] = [[]];
  let _queryCallIndex = 0;

  const db = {
    select: vi.fn(),
  };

  function setupDbChain() {
    _queryCallIndex = 0;
    db.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => {
            const result = _queryResults[_queryCallIndex] ?? [];
            _queryCallIndex++;
            return Promise.resolve(result);
          }),
        })),
      })),
    }));
  }

  function setQueryResults(...results: any[][]) {
    _queryResults = results;
    _queryCallIndex = 0;
  }

  return {
    getAccountingSettings,
    resolvePaymentTypeAccounts,
    logUnmappedEvent,
    postEntry,
    voidJournalEntry,
    db,
    setupDbChain,
    setQueryResults,
  };
});

vi.mock('@oppsera/db', () => ({
  db: mocks.db,
  glJournalEntries: {
    id: 'id',
    tenantId: 'tenant_id',
    sourceModule: 'source_module',
    sourceReferenceId: 'source_reference_id',
    status: 'status',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: string, b: string) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
}));

vi.mock('../helpers/get-accounting-settings', () => ({
  getAccountingSettings: mocks.getAccountingSettings,
}));

vi.mock('../helpers/resolve-mapping', () => ({
  resolvePaymentTypeAccounts: (...args: any[]) => mocks.resolvePaymentTypeAccounts(...args),
  logUnmappedEvent: (...args: any[]) => mocks.logUnmappedEvent(...args),
}));

vi.mock('@oppsera/core/helpers/accounting-posting-api', () => ({
  getAccountingPostingApi: () => ({
    postEntry: mocks.postEntry,
  }),
}));

vi.mock('../commands/void-journal-entry', () => ({
  voidJournalEntry: (...args: any[]) => mocks.voidJournalEntry(...args),
}));

import {
  handleAchOriginatedForAccounting,
  handleAchSettledForAccounting,
  handleAchReturnGlReversal,
} from '../adapters/ach-posting-adapter';
import type { EventEnvelope } from '@oppsera/shared';

// ── Test data ──────────────────────────────────────────────────────

const defaultSettings = {
  tenantId: 'tenant-1',
  defaultAchReceivableAccountId: 'acct-ach-recv',
  defaultUncategorizedRevenueAccountId: 'acct-uncat-rev',
  defaultUndepositedFundsAccountId: 'acct-undep-funds',
};

function createOriginatedEvent(overrides: Record<string, unknown> = {}): EventEnvelope {
  return {
    eventId: 'evt-1',
    eventType: 'payment.gateway.ach_originated.v1',
    tenantId: 'tenant-1',
    occurredAt: '2026-01-15T12:00:00Z',
    data: {
      paymentIntentId: 'intent-1',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      merchantAccountId: 'ma-1',
      amountCents: 5000,
      currency: 'USD',
      orderId: null,
      customerId: 'cust-1',
      providerRef: 'ref-123',
      achSecCode: 'WEB',
      achAccountType: 'ECHK',
      bankLast4: '4321',
      ...overrides,
    },
    version: 1,
  } as unknown as EventEnvelope;
}

function createSettledEvent(overrides: Record<string, unknown> = {}): EventEnvelope {
  return {
    eventId: 'evt-2',
    eventType: 'payment.gateway.ach_settled.v1',
    tenantId: 'tenant-1',
    occurredAt: '2026-01-17T12:00:00Z',
    data: {
      paymentIntentId: 'intent-1',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      merchantAccountId: 'ma-1',
      amountCents: 5000,
      settledAt: '2026-01-17T08:00:00Z',
      fundingDate: '2026-01-17',
      providerRef: 'ref-123',
      ...overrides,
    },
    version: 1,
  } as unknown as EventEnvelope;
}

function createReturnedEvent(overrides: Record<string, unknown> = {}): EventEnvelope {
  return {
    eventId: 'evt-3',
    eventType: 'payment.gateway.ach_returned.v1',
    tenantId: 'tenant-1',
    occurredAt: '2026-01-20T12:00:00Z',
    data: {
      paymentIntentId: 'intent-1',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      merchantAccountId: 'ma-1',
      amountCents: 5000,
      returnCode: 'R01',
      returnReason: 'Insufficient Funds',
      returnDate: '2026-01-20',
      providerRef: 'ref-123',
      orderId: null,
      customerId: 'cust-1',
      achReturnId: 'return-1',
      isRetryable: true,
      ...overrides,
    },
    version: 1,
  } as unknown as EventEnvelope;
}

// ────────────────────────────────────────────────────────────────────

describe('ACH GL Posting Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setupDbChain();
    mocks.getAccountingSettings.mockResolvedValue(defaultSettings);
    mocks.resolvePaymentTypeAccounts.mockResolvedValue(null);
    mocks.logUnmappedEvent.mockResolvedValue(undefined);
    mocks.voidJournalEntry.mockResolvedValue({});
  });

  // ─── handleAchOriginatedForAccounting ─────────────────────────────

  describe('handleAchOriginatedForAccounting', () => {
    it('should post origination GL entry with correct debit/credit accounts and amounts', async () => {
      await handleAchOriginatedForAccounting(createOriginatedEvent());

      expect(mocks.postEntry).toHaveBeenCalledOnce();
      const [ctx, input] = mocks.postEntry.mock.calls[0]!;

      expect(ctx.tenantId).toBe('tenant-1');
      expect(ctx.user.id).toBe('system');
      expect(input.sourceModule).toBe('ach');
      expect(input.sourceReferenceId).toBe('ach-orig-intent-1');
      expect(input.forcePost).toBe(true);
      expect(input.currency).toBe('USD');
      expect(input.lines).toHaveLength(2);

      // Dr ACH Receivable
      expect(input.lines[0].accountId).toBe('acct-ach-recv');
      expect(input.lines[0].debitAmount).toBe('50.00');
      expect(input.lines[0].creditAmount).toBe('0');
      expect(input.lines[0].channel).toBe('ach');

      // Cr Uncategorized Revenue
      expect(input.lines[1].accountId).toBe('acct-uncat-rev');
      expect(input.lines[1].debitAmount).toBe('0');
      expect(input.lines[1].creditAmount).toBe('50.00');
      expect(input.lines[1].channel).toBe('ach');
    });

    it('should return early when no accounting settings found', async () => {
      mocks.getAccountingSettings.mockResolvedValue(null);

      await handleAchOriginatedForAccounting(createOriginatedEvent());

      expect(mocks.postEntry).not.toHaveBeenCalled();
      expect(mocks.logUnmappedEvent).not.toHaveBeenCalled();
    });

    it('should log unmapped event when no ACH Receivable account configured', async () => {
      mocks.getAccountingSettings.mockResolvedValue({
        ...defaultSettings,
        defaultAchReceivableAccountId: null,
      });

      await handleAchOriginatedForAccounting(createOriginatedEvent());

      expect(mocks.logUnmappedEvent).toHaveBeenCalledOnce();
      expect(mocks.logUnmappedEvent.mock.calls[0]![2]).toMatchObject({
        eventType: 'payment.gateway.ach_originated.v1',
        sourceModule: 'ach',
        entityType: 'ach_receivable',
        reason: expect.stringContaining('Missing ACH Receivable'),
      });
      expect(mocks.postEntry).not.toHaveBeenCalled();
    });

    it('should log unmapped event when no revenue account configured', async () => {
      mocks.getAccountingSettings.mockResolvedValue({
        ...defaultSettings,
        defaultUncategorizedRevenueAccountId: null,
      });

      await handleAchOriginatedForAccounting(createOriginatedEvent());

      expect(mocks.logUnmappedEvent).toHaveBeenCalledOnce();
      expect(mocks.logUnmappedEvent.mock.calls[0]![2]).toMatchObject({
        eventType: 'payment.gateway.ach_originated.v1',
        sourceModule: 'ach',
        entityType: 'revenue_account',
        reason: expect.stringContaining('Missing uncategorized revenue'),
      });
      expect(mocks.postEntry).not.toHaveBeenCalled();
    });

    it('should convert cents to dollars correctly (5000 -> "50.00")', async () => {
      const event = createOriginatedEvent({ amountCents: 12345 });

      await handleAchOriginatedForAccounting(event);

      const lines = mocks.postEntry.mock.calls[0]![1].lines as any[];
      expect(lines[0].debitAmount).toBe('123.45');
      expect(lines[1].creditAmount).toBe('123.45');
    });

    it('should use source reference ach-orig-${intentId}', async () => {
      const event = createOriginatedEvent({ paymentIntentId: 'pi-abc-xyz' });

      await handleAchOriginatedForAccounting(event);

      const input = mocks.postEntry.mock.calls[0]![1];
      expect(input.sourceReferenceId).toBe('ach-orig-pi-abc-xyz');
    });

    it('should never throw — catches posting errors and logs', async () => {
      mocks.postEntry.mockRejectedValue(new Error('GL posting exploded'));

      await expect(
        handleAchOriginatedForAccounting(createOriginatedEvent()),
      ).resolves.toBeUndefined();
    });

    it('should log posting error to unmapped events on failure', async () => {
      mocks.postEntry.mockRejectedValue(new Error('GL posting exploded'));

      await handleAchOriginatedForAccounting(createOriginatedEvent());

      expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
        expect.anything(),
        'tenant-1',
        expect.objectContaining({
          eventType: 'payment.gateway.ach_originated.v1',
          sourceModule: 'ach',
          entityType: 'posting_error',
          entityId: 'intent-1',
          reason: expect.stringContaining('GL posting failed: GL posting exploded'),
        }),
      );
    });
  });

  // ─── handleAchSettledForAccounting ────────────────────────────────

  describe('handleAchSettledForAccounting', () => {
    it('should post settlement GL entry (Dr Bank / Cr ACH Receivable)', async () => {
      mocks.resolvePaymentTypeAccounts.mockResolvedValue({
        depositAccountId: 'acct-bank',
      });

      await handleAchSettledForAccounting(createSettledEvent());

      expect(mocks.postEntry).toHaveBeenCalledOnce();
      const [ctx, input] = mocks.postEntry.mock.calls[0]!;

      expect(ctx.tenantId).toBe('tenant-1');
      expect(input.sourceModule).toBe('ach');
      expect(input.sourceReferenceId).toBe('ach-settle-intent-1');
      expect(input.forcePost).toBe(true);
      expect(input.businessDate).toBe('2026-01-17');
      expect(input.lines).toHaveLength(2);

      // Dr Bank Account
      expect(input.lines[0].accountId).toBe('acct-bank');
      expect(input.lines[0].debitAmount).toBe('50.00');
      expect(input.lines[0].creditAmount).toBe('0');

      // Cr ACH Receivable
      expect(input.lines[1].accountId).toBe('acct-ach-recv');
      expect(input.lines[1].debitAmount).toBe('0');
      expect(input.lines[1].creditAmount).toBe('50.00');
    });

    it('should return early when no settings found', async () => {
      mocks.getAccountingSettings.mockResolvedValue(null);

      await handleAchSettledForAccounting(createSettledEvent());

      expect(mocks.postEntry).not.toHaveBeenCalled();
      expect(mocks.logUnmappedEvent).not.toHaveBeenCalled();
    });

    it('should log unmapped when no ACH Receivable configured', async () => {
      mocks.getAccountingSettings.mockResolvedValue({
        ...defaultSettings,
        defaultAchReceivableAccountId: null,
      });

      await handleAchSettledForAccounting(createSettledEvent());

      expect(mocks.logUnmappedEvent).toHaveBeenCalledOnce();
      expect(mocks.logUnmappedEvent.mock.calls[0]![2]).toMatchObject({
        eventType: 'payment.gateway.ach_settled.v1',
        sourceModule: 'ach',
        entityType: 'ach_receivable',
        reason: expect.stringContaining('Missing ACH Receivable'),
      });
      expect(mocks.postEntry).not.toHaveBeenCalled();
    });

    it('should use ACH payment type mapping for bank account', async () => {
      mocks.resolvePaymentTypeAccounts.mockResolvedValue({
        depositAccountId: 'acct-ach-bank-mapped',
      });

      await handleAchSettledForAccounting(createSettledEvent());

      const lines = mocks.postEntry.mock.calls[0]![1].lines as any[];
      expect(lines[0].accountId).toBe('acct-ach-bank-mapped');
    });

    it('should fall back to defaultUndepositedFundsAccountId when no ACH mapping', async () => {
      mocks.resolvePaymentTypeAccounts.mockResolvedValue(null);

      await handleAchSettledForAccounting(createSettledEvent());

      const lines = mocks.postEntry.mock.calls[0]![1].lines as any[];
      expect(lines[0].accountId).toBe('acct-undep-funds');
    });

    it('should log unmapped when no bank account available', async () => {
      mocks.resolvePaymentTypeAccounts.mockResolvedValue(null);
      mocks.getAccountingSettings.mockResolvedValue({
        ...defaultSettings,
        defaultUndepositedFundsAccountId: null,
      });

      await handleAchSettledForAccounting(createSettledEvent());

      expect(mocks.logUnmappedEvent).toHaveBeenCalledOnce();
      expect(mocks.logUnmappedEvent.mock.calls[0]![2]).toMatchObject({
        eventType: 'payment.gateway.ach_settled.v1',
        sourceModule: 'ach',
        entityType: 'bank_account',
        reason: expect.stringContaining('Missing bank/deposit account'),
      });
      expect(mocks.postEntry).not.toHaveBeenCalled();
    });

    it('should never throw — catches errors and logs', async () => {
      mocks.postEntry.mockRejectedValue(new Error('Settlement posting failed'));

      await expect(
        handleAchSettledForAccounting(createSettledEvent()),
      ).resolves.toBeUndefined();

      expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
        expect.anything(),
        'tenant-1',
        expect.objectContaining({
          eventType: 'payment.gateway.ach_settled.v1',
          entityType: 'posting_error',
          reason: expect.stringContaining('GL posting failed: Settlement posting failed'),
        }),
      );
    });
  });

  // ─── handleAchReturnGlReversal ────────────────────────────────────

  describe('handleAchReturnGlReversal', () => {
    it('should void origination GL entry when found', async () => {
      // First query (origination) returns an entry; second (settlement) returns nothing
      mocks.setQueryResults([{ id: 'je-orig-1' }], []);

      await handleAchReturnGlReversal(createReturnedEvent());

      expect(mocks.voidJournalEntry).toHaveBeenCalledTimes(1);
      expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          user: expect.objectContaining({ id: 'system' }),
        }),
        'je-orig-1',
        'ACH Return R01: Insufficient Funds',
      );
    });

    it('should void settlement GL entry when found', async () => {
      // First query (origination) returns nothing; second (settlement) returns an entry
      mocks.setQueryResults([], [{ id: 'je-settle-1' }]);

      await handleAchReturnGlReversal(createReturnedEvent());

      expect(mocks.voidJournalEntry).toHaveBeenCalledTimes(1);
      expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
        expect.anything(),
        'je-settle-1',
        'ACH Return R01: Insufficient Funds (settlement reversal)',
      );
    });

    it('should void both entries when both exist (post-settlement return)', async () => {
      mocks.setQueryResults([{ id: 'je-orig-1' }], [{ id: 'je-settle-1' }]);

      await handleAchReturnGlReversal(createReturnedEvent());

      expect(mocks.voidJournalEntry).toHaveBeenCalledTimes(2);
      expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
        expect.anything(),
        'je-orig-1',
        'ACH Return R01: Insufficient Funds',
      );
      expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
        expect.anything(),
        'je-settle-1',
        'ACH Return R01: Insufficient Funds (settlement reversal)',
      );
    });

    it('should silently return when neither entry found (POS adapter handles those)', async () => {
      mocks.setQueryResults([], []);

      await handleAchReturnGlReversal(createReturnedEvent());

      expect(mocks.voidJournalEntry).not.toHaveBeenCalled();
      expect(mocks.logUnmappedEvent).not.toHaveBeenCalled();
    });

    it('should continue to settlement void even if origination void fails', async () => {
      mocks.setQueryResults([{ id: 'je-orig-1' }], [{ id: 'je-settle-1' }]);
      mocks.voidJournalEntry
        .mockRejectedValueOnce(new Error('Origination void failed'))
        .mockResolvedValueOnce({});

      await handleAchReturnGlReversal(createReturnedEvent());

      // Both voids attempted despite first failure
      expect(mocks.voidJournalEntry).toHaveBeenCalledTimes(2);
      expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
        expect.anything(),
        'je-orig-1',
        expect.any(String),
      );
      expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
        expect.anything(),
        'je-settle-1',
        expect.any(String),
      );
    });

    it('should never throw — catches all errors and logs unmapped event', async () => {
      mocks.getAccountingSettings.mockRejectedValue(new Error('DB down'));

      await expect(
        handleAchReturnGlReversal(createReturnedEvent()),
      ).resolves.toBeUndefined();

      expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
        expect.anything(),
        'tenant-1',
        expect.objectContaining({
          eventType: 'payment.gateway.ach_returned.v1',
          sourceModule: 'ach',
          entityType: 'gl_reversal_error',
          entityId: 'return-1',
          reason: expect.stringContaining('ACH GL reversal failed: DB down'),
        }),
      );
    });

    it('should pass correct void reason with return code and reason text', async () => {
      mocks.setQueryResults([{ id: 'je-orig-1' }], [{ id: 'je-settle-1' }]);

      const event = createReturnedEvent({
        returnCode: 'R03',
        returnReason: 'No Account/Unable to Locate',
      });

      await handleAchReturnGlReversal(event);

      expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
        expect.anything(),
        'je-orig-1',
        'ACH Return R03: No Account/Unable to Locate',
      );
      expect(mocks.voidJournalEntry).toHaveBeenCalledWith(
        expect.anything(),
        'je-settle-1',
        'ACH Return R03: No Account/Unable to Locate (settlement reversal)',
      );
    });
  });
});
