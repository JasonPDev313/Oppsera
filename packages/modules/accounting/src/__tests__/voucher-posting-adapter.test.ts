import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleVoucherPurchaseForAccounting,
  handleVoucherRedemptionForAccounting,
  handleVoucherExpirationForAccounting,
} from '../adapters/voucher-posting-adapter';

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

vi.mock('../helpers/resolve-mapping', () => ({
  logUnmappedEvent: vi.fn(),
}));

const mockPostEntry = vi.fn().mockResolvedValue({ id: 'je-1', journalNumber: 1, status: 'posted' });
vi.mock('@oppsera/core/helpers/accounting-posting-api', () => ({
  getAccountingPostingApi: () => ({
    postEntry: mockPostEntry,
  }),
}));

const basePurchaseEvent = {
  eventId: 'evt-1',
  eventType: 'voucher.purchased.v1',
  occurredAt: new Date().toISOString(),
  tenantId: 'tenant-1',
  idempotencyKey: 'key-1',
  data: {
    voucherId: 'voucher-1',
    voucherNumber: 'GC-12345',
    voucherTypeId: 'vtype-1',
    amountCents: 5000,
    locationId: 'loc-1',
    businessDate: '2026-02-21',
    customerId: null,
    paymentMethod: 'cash',
    liabilityChartOfAccountId: 'acct-gift-liability',
  },
};

const baseRedeemEvent = {
  eventId: 'evt-2',
  eventType: 'voucher.redeemed.v1',
  occurredAt: new Date().toISOString(),
  tenantId: 'tenant-1',
  idempotencyKey: 'key-2',
  data: {
    voucherId: 'voucher-1',
    voucherNumber: 'GC-12345',
    amountCents: 2500,
    remainingBalanceCents: 2500,
    locationId: 'loc-1',
    businessDate: '2026-02-21',
    orderId: 'order-1',
    tenderId: 'tender-1',
    liabilityChartOfAccountId: 'acct-gift-liability',
  },
};

const baseExpireEvent = {
  eventId: 'evt-3',
  eventType: 'voucher.expired.v1',
  occurredAt: new Date().toISOString(),
  tenantId: 'tenant-1',
  idempotencyKey: 'key-3',
  data: {
    voucherId: 'voucher-1',
    voucherNumber: 'GC-12345',
    expirationAmountCents: 2500,
    expirationDate: '2026-02-21',
    liabilityChartOfAccountId: 'acct-gift-liability',
    expirationIncomeChartOfAccountId: 'acct-breakage-income',
  },
};

describe('Voucher GL Posting Adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Purchase ────────────────────────────────────────────────

  describe('handleVoucherPurchaseForAccounting', () => {
    it('should skip when no accounting settings', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(null);

      await handleVoucherPurchaseForAccounting(basePurchaseEvent as any);

      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should log unmapped event when liability account missing', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({
        defaultUndepositedFundsAccountId: 'acct-cash',
      });

      const { logUnmappedEvent } = await import('../helpers/resolve-mapping');

      const event = {
        ...basePurchaseEvent,
        data: { ...basePurchaseEvent.data, liabilityChartOfAccountId: null },
      };

      await handleVoucherPurchaseForAccounting(event as any);

      expect(logUnmappedEvent).toHaveBeenCalledOnce();
      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should log unmapped event when cash account missing', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({
        defaultUndepositedFundsAccountId: null,
      });

      const { logUnmappedEvent } = await import('../helpers/resolve-mapping');

      await handleVoucherPurchaseForAccounting(basePurchaseEvent as any);

      expect(logUnmappedEvent).toHaveBeenCalledOnce();
      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should post balanced GL entry: Dr Cash, Cr Liability', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({
        defaultUndepositedFundsAccountId: 'acct-cash',
      });

      await handleVoucherPurchaseForAccounting(basePurchaseEvent as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const [ctx, input] = mockPostEntry.mock.calls[0]!;

      expect(ctx.tenantId).toBe('tenant-1');
      expect(input.sourceModule).toBe('voucher');
      expect(input.sourceReferenceId).toBe('purchase-voucher-1');
      expect(input.forcePost).toBe(true);
      expect(input.lines).toHaveLength(2);

      // Debit cash
      expect(input.lines[0].accountId).toBe('acct-cash');
      expect(input.lines[0].debitAmount).toBe('50.00');
      expect(input.lines[0].creditAmount).toBe('0');

      // Credit liability
      expect(input.lines[1].accountId).toBe('acct-gift-liability');
      expect(input.lines[1].debitAmount).toBe('0');
      expect(input.lines[1].creditAmount).toBe('50.00');
    });

    it('should never throw — catches all errors', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

      await expect(handleVoucherPurchaseForAccounting(basePurchaseEvent as any)).resolves.toBeUndefined();
    });
  });

  // ─── Redemption ──────────────────────────────────────────────

  describe('handleVoucherRedemptionForAccounting', () => {
    it('should skip when no accounting settings', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(null);

      await handleVoucherRedemptionForAccounting(baseRedeemEvent as any);

      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should log unmapped event when liability account missing', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({
        defaultARControlAccountId: 'acct-revenue',
      });

      const { logUnmappedEvent } = await import('../helpers/resolve-mapping');

      const event = {
        ...baseRedeemEvent,
        data: { ...baseRedeemEvent.data, liabilityChartOfAccountId: null },
      };

      await handleVoucherRedemptionForAccounting(event as any);

      expect(logUnmappedEvent).toHaveBeenCalledOnce();
      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should log unmapped event when revenue account missing', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({
        defaultARControlAccountId: null,
      });

      const { logUnmappedEvent } = await import('../helpers/resolve-mapping');

      await handleVoucherRedemptionForAccounting(baseRedeemEvent as any);

      expect(logUnmappedEvent).toHaveBeenCalledOnce();
      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should post balanced GL entry: Dr Liability, Cr Revenue', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({
        defaultARControlAccountId: 'acct-revenue',
      });

      await handleVoucherRedemptionForAccounting(baseRedeemEvent as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const [ctx, input] = mockPostEntry.mock.calls[0]!;

      expect(ctx.tenantId).toBe('tenant-1');
      expect(input.sourceModule).toBe('voucher');
      expect(input.sourceReferenceId).toBe('redeem-voucher-1-tender-1');
      expect(input.forcePost).toBe(true);
      expect(input.lines).toHaveLength(2);

      // Debit liability (release deferred revenue)
      expect(input.lines[0].accountId).toBe('acct-gift-liability');
      expect(input.lines[0].debitAmount).toBe('25.00');
      expect(input.lines[0].creditAmount).toBe('0');

      // Credit revenue (recognize revenue)
      expect(input.lines[1].accountId).toBe('acct-revenue');
      expect(input.lines[1].debitAmount).toBe('0');
      expect(input.lines[1].creditAmount).toBe('25.00');
    });

    it('should never throw — catches all errors', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

      await expect(handleVoucherRedemptionForAccounting(baseRedeemEvent as any)).resolves.toBeUndefined();
    });
  });

  // ─── Expiration ──────────────────────────────────────────────

  describe('handleVoucherExpirationForAccounting', () => {
    it('should skip when no accounting settings', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(null);

      await handleVoucherExpirationForAccounting(baseExpireEvent as any);

      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should log unmapped event when liability account missing', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({});

      const { logUnmappedEvent } = await import('../helpers/resolve-mapping');

      const event = {
        ...baseExpireEvent,
        data: { ...baseExpireEvent.data, liabilityChartOfAccountId: null },
      };

      await handleVoucherExpirationForAccounting(event as any);

      expect(logUnmappedEvent).toHaveBeenCalledOnce();
      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should log unmapped event when breakage income account missing', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({});

      const { logUnmappedEvent } = await import('../helpers/resolve-mapping');

      const event = {
        ...baseExpireEvent,
        data: { ...baseExpireEvent.data, expirationIncomeChartOfAccountId: null },
      };

      await handleVoucherExpirationForAccounting(event as any);

      expect(logUnmappedEvent).toHaveBeenCalledOnce();
      expect(mockPostEntry).not.toHaveBeenCalled();
    });

    it('should post balanced GL entry: Dr Liability, Cr Breakage Income', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({});

      await handleVoucherExpirationForAccounting(baseExpireEvent as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const [ctx, input] = mockPostEntry.mock.calls[0]!;

      expect(ctx.tenantId).toBe('tenant-1');
      expect(input.sourceModule).toBe('voucher');
      expect(input.sourceReferenceId).toBe('expire-voucher-1');
      expect(input.businessDate).toBe('2026-02-21');
      expect(input.forcePost).toBe(true);
      expect(input.lines).toHaveLength(2);

      // Debit liability (release remaining deferred revenue)
      expect(input.lines[0].accountId).toBe('acct-gift-liability');
      expect(input.lines[0].debitAmount).toBe('25.00');
      expect(input.lines[0].creditAmount).toBe('0');

      // Credit breakage income
      expect(input.lines[1].accountId).toBe('acct-breakage-income');
      expect(input.lines[1].debitAmount).toBe('0');
      expect(input.lines[1].creditAmount).toBe('25.00');
    });

    it('should never throw — catches all errors', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

      await expect(handleVoucherExpirationForAccounting(baseExpireEvent as any)).resolves.toBeUndefined();
    });

    it('should convert cents to dollars correctly', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce({});

      const event = {
        ...baseExpireEvent,
        data: {
          ...baseExpireEvent.data,
          expirationAmountCents: 12345,
        },
      };

      await handleVoucherExpirationForAccounting(event as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const lines = mockPostEntry.mock.calls[0]![1].lines as any[];

      expect(lines[0].debitAmount).toBe('123.45');
      expect(lines[1].creditAmount).toBe('123.45');
    });
  });
});
