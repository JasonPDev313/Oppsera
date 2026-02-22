import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleChargebackReceivedForAccounting,
  handleChargebackResolvedForAccounting,
} from '../adapters/chargeback-posting-adapter';

vi.mock('@oppsera/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => ({ type: 'eq' })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  sql: vi.fn(),
}));

vi.mock('../helpers/get-accounting-settings', () => ({
  getAccountingSettings: vi.fn(),
}));

const mockResolvePaymentTypeAccounts = vi.fn();
const mockLogUnmappedEvent = vi.fn();
vi.mock('../helpers/resolve-mapping', () => ({
  resolvePaymentTypeAccounts: (...args: any[]) => mockResolvePaymentTypeAccounts(...args),
  logUnmappedEvent: (...args: any[]) => mockLogUnmappedEvent(...args),
}));

const mockPostEntry = vi.fn().mockResolvedValue({ id: 'je-1', journalNumber: 1, status: 'posted' });
vi.mock('@oppsera/core/helpers/accounting-posting-api', () => ({
  getAccountingPostingApi: () => ({
    postEntry: mockPostEntry,
  }),
}));

const baseReceivedEvent = {
  eventId: 'evt-1',
  eventType: 'chargeback.received.v1',
  occurredAt: new Date().toISOString(),
  tenantId: 'tenant-1',
  idempotencyKey: 'key-1',
  data: {
    chargebackId: 'cb-1',
    tenderId: 'tender-1',
    orderId: 'order-1',
    tenderType: 'card',
    chargebackAmountCents: 5000,
    feeAmountCents: 1500,
    locationId: 'loc-1',
    businessDate: '2026-02-21',
    customerId: 'cust-1',
    chargebackReason: 'Unauthorized transaction',
  },
};

const baseResolvedEvent = {
  eventId: 'evt-2',
  eventType: 'chargeback.resolved.v1',
  occurredAt: new Date().toISOString(),
  tenantId: 'tenant-1',
  idempotencyKey: 'key-2',
  data: {
    chargebackId: 'cb-1',
    tenderId: 'tender-1',
    orderId: 'order-1',
    tenderType: 'card',
    resolution: 'won',
    chargebackAmountCents: 5000,
    feeAmountCents: 1500,
    locationId: 'loc-1',
    businessDate: '2026-02-21',
    customerId: 'cust-1',
    resolutionReason: 'Sufficient evidence provided',
    glJournalEntryId: 'je-received-1',
  },
};

const defaultSettings = {
  defaultUndepositedFundsAccountId: 'acct-cash',
  defaultARControlAccountId: 'acct-ar',
};

const defaultPaymentMapping = {
  paymentTypeId: 'card',
  depositAccountId: 'acct-card-deposit',
  clearingAccountId: 'acct-card-clearing',
  feeExpenseAccountId: 'acct-card-fees',
};

describe('Chargeback GL Posting Adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Received ──────────────────────────────────────────────

  describe('handleChargebackReceivedForAccounting', () => {
    it('should skip when no accounting settings', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(null);

      await handleChargebackReceivedForAccounting(baseReceivedEvent as any);

      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should log unmapped event when deposit account missing', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({
        defaultUndepositedFundsAccountId: null,
      });
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(null);

      await handleChargebackReceivedForAccounting(baseReceivedEvent as any);

      expect(mockLogUnmappedEvent).toHaveBeenCalledOnce();
      expect(mockLogUnmappedEvent.mock.calls[0]![2].reason).toContain('deposit/cash account');
      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should log unmapped event when fee expense account missing', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(defaultSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce({
        ...defaultPaymentMapping,
        feeExpenseAccountId: null,
      });

      await handleChargebackReceivedForAccounting(baseReceivedEvent as any);

      expect(mockLogUnmappedEvent).toHaveBeenCalledOnce();
      expect(mockLogUnmappedEvent.mock.calls[0]![2].reason).toContain('fee expense account');
      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should post balanced GL entry: Dr Expense, Cr Cash', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(defaultSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);

      await handleChargebackReceivedForAccounting(baseReceivedEvent as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const [ctx, input] = mockPostEntry.mock.calls[0]!;

      expect(ctx.tenantId).toBe('tenant-1');
      expect(input.sourceModule).toBe('chargeback');
      expect(input.sourceReferenceId).toBe('received-cb-1');
      expect(input.forcePost).toBe(true);
      expect(input.lines).toHaveLength(2);

      // Debit expense
      expect(input.lines[0].accountId).toBe('acct-card-fees');
      expect(input.lines[0].debitAmount).toBe('50.00');
      expect(input.lines[0].creditAmount).toBe('0');

      // Credit cash/bank
      expect(input.lines[1].accountId).toBe('acct-card-deposit');
      expect(input.lines[1].debitAmount).toBe('0');
      expect(input.lines[1].creditAmount).toBe('50.00');
    });

    it('should fall back to undeposited funds when no payment type mapping', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(defaultSettings);
      // No payment type mapping — returns null
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(null);

      await handleChargebackReceivedForAccounting(baseReceivedEvent as any);

      // Should log unmapped for fee expense since payment mapping is null
      expect(mockLogUnmappedEvent).toHaveBeenCalledOnce();
      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should convert cents to dollars correctly', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(defaultSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);

      const event = {
        ...baseReceivedEvent,
        data: { ...baseReceivedEvent.data, chargebackAmountCents: 12345 },
      };

      await handleChargebackReceivedForAccounting(event as any);

      const lines = mockPostEntry.mock.calls[0]![1].lines as any[];
      expect(lines[0].debitAmount).toBe('123.45');
      expect(lines[1].creditAmount).toBe('123.45');
    });

    it('should never throw — catches all errors', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

      await expect(handleChargebackReceivedForAccounting(baseReceivedEvent as any)).resolves.toBeUndefined();
    });

    it('should include locationId on GL lines', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(defaultSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);

      await handleChargebackReceivedForAccounting(baseReceivedEvent as any);

      const lines = mockPostEntry.mock.calls[0]![1].lines as any[];
      expect(lines[0].locationId).toBe('loc-1');
      expect(lines[1].locationId).toBe('loc-1');
    });
  });

  // ─── Resolved (Won) ────────────────────────────────────────

  describe('handleChargebackResolvedForAccounting — Won', () => {
    it('should skip when no accounting settings', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(null);

      await handleChargebackResolvedForAccounting(baseResolvedEvent as any);

      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should post reversal GL entry: Dr Cash, Cr Expense (won)', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(defaultSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);

      await handleChargebackResolvedForAccounting(baseResolvedEvent as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const [ctx, input] = mockPostEntry.mock.calls[0]!;

      expect(input.sourceModule).toBe('chargeback');
      expect(input.sourceReferenceId).toBe('won-cb-1');
      expect(input.forcePost).toBe(true);
      expect(input.lines).toHaveLength(2);

      // Debit cash (money returned)
      expect(input.lines[0].accountId).toBe('acct-card-deposit');
      expect(input.lines[0].debitAmount).toBe('50.00');
      expect(input.lines[0].creditAmount).toBe('0');

      // Credit expense (reverse the expense)
      expect(input.lines[1].accountId).toBe('acct-card-fees');
      expect(input.lines[1].debitAmount).toBe('0');
      expect(input.lines[1].creditAmount).toBe('50.00');
    });

    it('should never throw — catches all errors', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

      await expect(handleChargebackResolvedForAccounting(baseResolvedEvent as any)).resolves.toBeUndefined();
    });
  });

  // ─── Resolved (Lost) ───────────────────────────────────────

  describe('handleChargebackResolvedForAccounting — Lost', () => {
    const lostEvent = {
      ...baseResolvedEvent,
      data: {
        ...baseResolvedEvent.data,
        resolution: 'lost',
        feeAmountCents: 2500,
      },
    };

    it('should post fee GL entry when lost with fee > 0', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(defaultSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);

      await handleChargebackResolvedForAccounting(lostEvent as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const [, input] = mockPostEntry.mock.calls[0]!;

      expect(input.sourceReferenceId).toBe('lost-fee-cb-1');
      expect(input.lines).toHaveLength(2);

      // Debit fee expense
      expect(input.lines[0].accountId).toBe('acct-card-fees');
      expect(input.lines[0].debitAmount).toBe('25.00');

      // Credit cash
      expect(input.lines[1].accountId).toBe('acct-card-deposit');
      expect(input.lines[1].creditAmount).toBe('25.00');
    });

    it('should NOT post GL entry when lost with fee = 0', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(defaultSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);

      const lostNoFee = {
        ...baseResolvedEvent,
        data: {
          ...baseResolvedEvent.data,
          resolution: 'lost',
          feeAmountCents: 0,
        },
      };

      await handleChargebackResolvedForAccounting(lostNoFee as any);

      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should log unmapped event when accounts missing', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({
        defaultUndepositedFundsAccountId: null,
      });
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(null);

      await handleChargebackResolvedForAccounting(lostEvent as any);

      expect(mockLogUnmappedEvent).toHaveBeenCalledOnce();
      expect(mockPostEntry).not.toHaveBeenCalled();
    });
  });
});
