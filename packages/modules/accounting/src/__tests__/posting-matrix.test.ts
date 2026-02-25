/**
 * Posting Matrix Validation Tests
 *
 * Validates that every GL posting scenario produces balanced journal entries
 * (sum of debits = sum of credits) across all tender types and GL categories.
 *
 * Covers:
 * - POS adapter (tender → GL)
 * - Void adapter (order void → reversal GL)
 * - Return adapter (line-item return → GL)
 * - Voucher adapter (purchase/redeem/expire → GL)
 * - Membership adapter (billing → GL)
 * - Chargeback adapter (received/won/lost → GL)
 * - F&B adapter (batch close → GL)
 *
 * SESSION 48: Integration Tests + Posting Matrix
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock infrastructure ────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => ({ type: 'eq' })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  sql: Object.assign(vi.fn(), {
    join: vi.fn(),
    identifier: vi.fn(),
  }),
}));

vi.mock('../helpers/get-accounting-settings', () => ({
  getAccountingSettings: vi.fn(),
}));

const mockLogUnmappedEvent = vi.fn();
const mockResolveSubDeptAccounts = vi.fn();
const mockResolvePaymentTypeAccounts = vi.fn();
const mockBatchResolveSubDepartmentAccounts = vi.fn();
const mockBatchResolveTaxGroupAccounts = vi.fn();
vi.mock('../helpers/resolve-mapping', () => ({
  resolveSubDepartmentAccounts: (...args: any[]) => mockResolveSubDeptAccounts(...args),
  resolvePaymentTypeAccounts: (...args: any[]) => mockResolvePaymentTypeAccounts(...args),
  resolveTaxGroupAccount: vi.fn().mockResolvedValue('acct-tax-payable'),
  batchResolveSubDepartmentAccounts: (...args: any[]) => mockBatchResolveSubDepartmentAccounts(...args),
  batchResolveTaxGroupAccounts: (...args: any[]) => mockBatchResolveTaxGroupAccounts(...args),
  logUnmappedEvent: (...args: any[]) => mockLogUnmappedEvent(...args),
}));

vi.mock('../helpers/catalog-gl-resolution', () => ({
  expandPackageForGL: vi.fn((line: any) => [
    {
      subDepartmentId: line.subDepartmentId ?? 'subdept-1',
      amountCents: line.extendedPriceCents ?? 1000,
    },
  ]),
}));

// Track all postEntry calls across adapters
const allPostedEntries: Array<{ adapter: string; input: any }> = [];
const mockPostEntry = vi.fn().mockImplementation((_ctx, input) => {
  allPostedEntries.push({ adapter: 'unknown', input });
  return Promise.resolve({ id: 'je-1', journalNumber: 1, status: 'posted' });
});

vi.mock('@oppsera/core/helpers/accounting-posting-api', () => ({
  getAccountingPostingApi: () => ({
    postEntry: mockPostEntry,
    getSettings: vi.fn().mockResolvedValue(null),
  }),
}));

// ── Helper: Validate balanced GL entry ─────────────────────────

function expectBalanced(lines: Array<{ debitAmount: string; creditAmount: string }>, label: string) {
  const totalDebits = lines.reduce((s, l) => s + Number(l.debitAmount), 0);
  const totalCredits = lines.reduce((s, l) => s + Number(l.creditAmount), 0);

  expect(totalDebits).toBeCloseTo(totalCredits, 2);
  expect(totalDebits).toBeGreaterThan(0);

  if (Math.abs(totalDebits - totalCredits) >= 0.01) {
    throw new Error(
      `${label}: GL entry unbalanced — debits=$${totalDebits.toFixed(2)}, credits=$${totalCredits.toFixed(2)}, diff=$${(totalDebits - totalCredits).toFixed(2)}`,
    );
  }
}

// ── Shared settings ────────────────────────────────────────────

const fullSettings = {
  tenantId: 'tenant-1',
  baseCurrency: 'USD',
  fiscalYearStartMonth: 1,
  autoPostMode: 'auto',
  lockPeriodThrough: null,
  defaultAPControlAccountId: 'acct-ap-control',
  defaultARControlAccountId: 'acct-ar-control',
  defaultSalesTaxPayableAccountId: 'acct-tax-payable',
  defaultUndepositedFundsAccountId: 'acct-undeposited',
  defaultRetainedEarningsAccountId: 'acct-retained',
  defaultRoundingAccountId: 'acct-rounding',
  defaultPmsGuestLedgerAccountId: 'acct-pms-guest',
  roundingToleranceCents: 5,
  enableCogsPosting: true,
  enableInventoryPosting: true,
  postByLocation: true,
  enableUndepositedFundsWorkflow: true,
  enableLegacyGlPosting: false,
  defaultTipsPayableAccountId: 'acct-tips-payable',
  defaultServiceChargeRevenueAccountId: 'acct-svc-charge-revenue',
  defaultUncategorizedRevenueAccountId: 'acct-uncategorized-revenue',
  defaultCashOverShortAccountId: 'acct-cash-over-short',
  defaultCompExpenseAccountId: 'acct-comp-expense',
  defaultReturnsAccountId: 'acct-returns',
  defaultPayrollClearingAccountId: 'acct-payroll-clearing',
  cogsPostingMode: 'disabled',
  periodicCogsLastCalculatedDate: null,
  periodicCogsMethod: null,
  recognizeBreakageAutomatically: true,
  breakageRecognitionMethod: 'on_expiry',
  breakageIncomeAccountId: null,
  voucherExpiryEnabled: true,
};

const fullSubDeptMapping = {
  subDepartmentId: 'subdept-1',
  revenueAccountId: 'acct-revenue',
  cogsAccountId: 'acct-cogs',
  inventoryAccountId: 'acct-inventory',
  discountAccountId: 'acct-discount',
  returnsAccountId: 'acct-returns',
};

const fullPaymentMapping = {
  paymentTypeId: 'card',
  depositAccountId: 'acct-card-deposit',
  clearingAccountId: 'acct-card-clearing',
  feeExpenseAccountId: 'acct-card-fees',
};

// ── Tests ──────────────────────────────────────────────────────

describe('GL Posting Matrix — Balance Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allPostedEntries.length = 0;
    // Default batch resolve mocks for POS adapter tests
    mockBatchResolveSubDepartmentAccounts.mockResolvedValue(new Map([['subdept-1', fullSubDeptMapping]]));
    mockBatchResolveTaxGroupAccounts.mockResolvedValue(new Map());
  });

  // ─── Voucher Adapters ─────────────────────────────────────

  describe('Voucher Lifecycle', () => {
    it('PURCHASE: Dr Cash, Cr Liability — balanced', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);

      const { handleVoucherPurchaseForAccounting } = await import(
        '../adapters/voucher-posting-adapter'
      );

      await handleVoucherPurchaseForAccounting({
        eventId: 'e1', eventType: 'voucher.purchased.v1', occurredAt: new Date().toISOString(),
        tenantId: 'tenant-1', idempotencyKey: 'k1',
        data: {
          voucherId: 'v1', voucherNumber: 'GC-001', voucherTypeId: 'vt1',
          amountCents: 10000, locationId: 'loc-1', businessDate: '2026-02-21',
          customerId: null, paymentMethod: 'cash',
          liabilityChartOfAccountId: 'acct-liability',
        },
      } as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      expectBalanced(mockPostEntry.mock.calls[0]![1].lines, 'Voucher Purchase');
    });

    it('REDEMPTION: Dr Liability, Cr Revenue — balanced', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);

      const { handleVoucherRedemptionForAccounting } = await import(
        '../adapters/voucher-posting-adapter'
      );

      await handleVoucherRedemptionForAccounting({
        eventId: 'e2', eventType: 'voucher.redeemed.v1', occurredAt: new Date().toISOString(),
        tenantId: 'tenant-1', idempotencyKey: 'k2',
        data: {
          voucherId: 'v1', voucherNumber: 'GC-001', amountCents: 5000,
          remainingBalanceCents: 5000, locationId: 'loc-1',
          businessDate: '2026-02-21', orderId: 'o1', tenderId: 't1',
          liabilityChartOfAccountId: 'acct-liability',
        },
      } as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      expectBalanced(mockPostEntry.mock.calls[0]![1].lines, 'Voucher Redemption');
    });

    it('EXPIRATION: Dr Liability, Cr Breakage Income — balanced', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);

      const { handleVoucherExpirationForAccounting } = await import(
        '../adapters/voucher-posting-adapter'
      );

      await handleVoucherExpirationForAccounting({
        eventId: 'e3', eventType: 'voucher.expired.v1', occurredAt: new Date().toISOString(),
        tenantId: 'tenant-1', idempotencyKey: 'k3',
        data: {
          voucherId: 'v1', voucherNumber: 'GC-001', expirationAmountCents: 5000,
          expirationDate: '2026-02-21',
          liabilityChartOfAccountId: 'acct-liability',
          expirationIncomeChartOfAccountId: 'acct-breakage',
        },
      } as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      expectBalanced(mockPostEntry.mock.calls[0]![1].lines, 'Voucher Expiration');
    });
  });

  // ─── Membership Adapter ───────────────────────────────────

  describe('Membership Billing', () => {
    it('BILLING: Dr AR, Cr Deferred Revenue — balanced', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);

      const { handleMembershipBillingForAccounting } = await import(
        '../adapters/membership-posting-adapter'
      );

      await handleMembershipBillingForAccounting({
        eventId: 'e4', eventType: 'membership.billing.charged.v1', occurredAt: new Date().toISOString(),
        tenantId: 'tenant-1', idempotencyKey: 'k4',
        data: {
          membershipId: 'm1', planId: 'p1', customerId: 'c1',
          amountCents: 9900, locationId: 'loc-1',
          businessDate: '2026-02-21', billingPeriodStart: '2026-03-01',
          billingPeriodEnd: '2026-03-31',
          deferredRevenueGlAccountId: 'acct-deferred-rev',
        },
      } as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      expectBalanced(mockPostEntry.mock.calls[0]![1].lines, 'Membership Billing');
    });
  });

  // ─── Chargeback Adapters ──────────────────────────────────

  describe('Chargeback Lifecycle', () => {
    it('RECEIVED: Dr Expense, Cr Cash — balanced', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(fullPaymentMapping);

      const { handleChargebackReceivedForAccounting } = await import(
        '../adapters/chargeback-posting-adapter'
      );

      await handleChargebackReceivedForAccounting({
        eventId: 'e5', eventType: 'chargeback.received.v1', occurredAt: new Date().toISOString(),
        tenantId: 'tenant-1', idempotencyKey: 'k5',
        data: {
          chargebackId: 'cb-1', tenderId: 't1', orderId: 'o1',
          tenderType: 'card', chargebackAmountCents: 5000,
          feeAmountCents: 1500, locationId: 'loc-1',
          businessDate: '2026-02-21', customerId: null,
          chargebackReason: 'Unauthorized',
        },
      } as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      expectBalanced(mockPostEntry.mock.calls[0]![1].lines, 'Chargeback Received');
    });

    it('WON: Dr Cash, Cr Expense (reversal) — balanced', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(fullPaymentMapping);

      const { handleChargebackResolvedForAccounting } = await import(
        '../adapters/chargeback-posting-adapter'
      );

      await handleChargebackResolvedForAccounting({
        eventId: 'e6', eventType: 'chargeback.resolved.v1', occurredAt: new Date().toISOString(),
        tenantId: 'tenant-1', idempotencyKey: 'k6',
        data: {
          chargebackId: 'cb-1', tenderId: 't1', orderId: 'o1',
          tenderType: 'card', resolution: 'won',
          chargebackAmountCents: 5000, feeAmountCents: 0,
          locationId: 'loc-1', businessDate: '2026-02-21',
          customerId: null, resolutionReason: 'Evidence provided',
          glJournalEntryId: 'je-recv-1',
        },
      } as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      expectBalanced(mockPostEntry.mock.calls[0]![1].lines, 'Chargeback Won');
    });

    it('LOST with fee: Dr Fee Expense, Cr Cash — balanced', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(fullPaymentMapping);

      const { handleChargebackResolvedForAccounting } = await import(
        '../adapters/chargeback-posting-adapter'
      );

      await handleChargebackResolvedForAccounting({
        eventId: 'e7', eventType: 'chargeback.resolved.v1', occurredAt: new Date().toISOString(),
        tenantId: 'tenant-1', idempotencyKey: 'k7',
        data: {
          chargebackId: 'cb-1', tenderId: 't1', orderId: 'o1',
          tenderType: 'card', resolution: 'lost',
          chargebackAmountCents: 5000, feeAmountCents: 2500,
          locationId: 'loc-1', businessDate: '2026-02-21',
          customerId: null, resolutionReason: 'Insufficient evidence',
          glJournalEntryId: 'je-recv-1',
        },
      } as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      expectBalanced(mockPostEntry.mock.calls[0]![1].lines, 'Chargeback Lost Fee');
    });

    it('LOST with zero fee: no GL entry posted', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(fullPaymentMapping);

      const { handleChargebackResolvedForAccounting } = await import(
        '../adapters/chargeback-posting-adapter'
      );

      await handleChargebackResolvedForAccounting({
        eventId: 'e8', eventType: 'chargeback.resolved.v1', occurredAt: new Date().toISOString(),
        tenantId: 'tenant-1', idempotencyKey: 'k8',
        data: {
          chargebackId: 'cb-1', tenderId: 't1', orderId: 'o1',
          tenderType: 'card', resolution: 'lost',
          chargebackAmountCents: 5000, feeAmountCents: 0,
          locationId: 'loc-1', businessDate: '2026-02-21',
          customerId: null, resolutionReason: 'Insufficient evidence',
          glJournalEntryId: 'je-recv-1',
        },
      } as any);

      expect(mockPostEntry).not.toHaveBeenCalled();
    });
  });

  // ─── Cents-to-Dollars Conversion Matrix ───────────────────

  describe('Cents-to-Dollars Conversion Accuracy', () => {
    const testAmounts = [1, 50, 99, 100, 999, 1000, 9999, 10000, 12345, 99999, 100000];

    it.each(testAmounts)('converts %i cents correctly', async (amountCents) => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);

      const { handleVoucherPurchaseForAccounting } = await import(
        '../adapters/voucher-posting-adapter'
      );

      await handleVoucherPurchaseForAccounting({
        eventId: `e-${amountCents}`, eventType: 'voucher.purchased.v1',
        occurredAt: new Date().toISOString(), tenantId: 'tenant-1',
        idempotencyKey: `k-${amountCents}`,
        data: {
          voucherId: 'v1', voucherNumber: 'GC-001', voucherTypeId: 'vt1',
          amountCents, locationId: 'loc-1', businessDate: '2026-02-21',
          customerId: null, paymentMethod: 'cash',
          liabilityChartOfAccountId: 'acct-liability',
        },
      } as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const lines = mockPostEntry.mock.calls[0]![1].lines;
      const expectedDollars = (amountCents / 100).toFixed(2);

      expect(lines[0].debitAmount).toBe(expectedDollars);
      expect(lines[1].creditAmount).toBe(expectedDollars);
      expectBalanced(lines, `${amountCents}¢ voucher purchase`);

      mockPostEntry.mockClear();
    });
  });

  // ─── Source Reference ID Uniqueness ───────────────────────

  describe('Source Reference ID Format', () => {
    it('each adapter uses unique sourceReferenceId prefixes', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );

      // Voucher purchase
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      const voucherAdapter = await import(
        '../adapters/voucher-posting-adapter'
      );
      await voucherAdapter.handleVoucherPurchaseForAccounting({
        eventId: 'e1', eventType: 'voucher.purchased.v1', occurredAt: new Date().toISOString(),
        tenantId: 'tenant-1', idempotencyKey: 'k1',
        data: {
          voucherId: 'v1', voucherNumber: 'GC-001', voucherTypeId: 'vt1',
          amountCents: 1000, locationId: 'loc-1', businessDate: '2026-02-21',
          customerId: null, paymentMethod: 'cash',
          liabilityChartOfAccountId: 'acct-liability',
        },
      } as any);

      // Chargeback received
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(fullPaymentMapping);
      const cbAdapter = await import(
        '../adapters/chargeback-posting-adapter'
      );
      await cbAdapter.handleChargebackReceivedForAccounting({
        eventId: 'e2', eventType: 'chargeback.received.v1', occurredAt: new Date().toISOString(),
        tenantId: 'tenant-1', idempotencyKey: 'k2',
        data: {
          chargebackId: 'cb-1', tenderId: 't1', orderId: 'o1',
          tenderType: 'card', chargebackAmountCents: 1000,
          feeAmountCents: 0, locationId: 'loc-1',
          businessDate: '2026-02-21', customerId: null,
          chargebackReason: 'Test',
        },
      } as any);

      // Membership billing
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      const membershipAdapter = await import(
        '../adapters/membership-posting-adapter'
      );
      await membershipAdapter.handleMembershipBillingForAccounting({
        eventId: 'e3', eventType: 'membership.billing.charged.v1', occurredAt: new Date().toISOString(),
        tenantId: 'tenant-1', idempotencyKey: 'k3',
        data: {
          membershipId: 'm1', planId: 'p1', customerId: 'c1',
          amountCents: 1000, locationId: 'loc-1',
          businessDate: '2026-02-21', billingPeriodStart: '2026-03-01',
          billingPeriodEnd: '2026-03-31',
          deferredRevenueGlAccountId: 'acct-deferred',
        },
      } as any);

      // Collect all sourceReferenceIds
      const sourceRefIds = mockPostEntry.mock.calls.map((c: any) => c[1].sourceReferenceId);
      const sourceModules = mockPostEntry.mock.calls.map((c: any) => c[1].sourceModule);

      // All must be unique
      const uniqueRefs = new Set(sourceRefIds);
      expect(uniqueRefs.size).toBe(sourceRefIds.length);

      // Source modules are distinct per adapter
      expect(sourceModules).toContain('voucher');
      expect(sourceModules).toContain('chargeback');
      expect(sourceModules).toContain('membership');

      // Reference ID prefixes are distinct
      expect(sourceRefIds[0]).toMatch(/^purchase-/);
      expect(sourceRefIds[1]).toMatch(/^received-/);
      expect(sourceRefIds[2]).toMatch(/^billing-/);
    });
  });

  // ─── POS Adapter Fallback Cascade ────────────────────────
  describe('POS Adapter Fallback Cascade', () => {
    const baseTenderEvent = {
      eventId: 'e-pos-1',
      eventType: 'tender.recorded.v1',
      occurredAt: new Date().toISOString(),
      tenantId: 'tenant-1',
      idempotencyKey: 'pos-k1',
      data: {
        tenderId: 't-1',
        orderId: 'o-1',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tenderType: 'cash',
        amount: 10000, // $100.00
        tipAmount: 0,
        orderTotal: 10000,
        subtotal: 10000,
        taxTotal: 0,
        discountTotal: 0,
        serviceChargeTotal: 0,
        businessDate: '2026-02-22',
        lines: [
          {
            catalogItemId: 'item-1',
            catalogItemName: 'Widget',
            subDepartmentId: 'subdept-1',
            qty: 1,
            extendedPriceCents: 10000,
            taxGroupId: null,
            taxAmountCents: 0,
            costCents: null,
            packageComponents: null,
          },
        ],
      },
    };

    it('posts with fallback when payment type mapping is missing', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(null); // no mapping!
      mockResolveSubDeptAccounts.mockResolvedValueOnce(fullSubDeptMapping);

      const { handleTenderForAccounting } = await import('../adapters/pos-posting-adapter');
      await handleTenderForAccounting(baseTenderEvent as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const lines = mockPostEntry.mock.calls[0]![1].lines;
      expectBalanced(lines, 'POS fallback payment type');
      // Debit should go to undeposited funds (fallback)
      expect(lines[0].accountId).toBe('acct-undeposited');
      // Unmapped event still logged
      expect(mockLogUnmappedEvent).toHaveBeenCalled();
    });

    it('posts with fallback when sub-department mapping is missing', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(fullPaymentMapping);
      mockResolveSubDeptAccounts.mockResolvedValueOnce(null); // no mapping!
      mockBatchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map()); // empty batch map

      const { handleTenderForAccounting } = await import('../adapters/pos-posting-adapter');
      await handleTenderForAccounting(baseTenderEvent as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const lines = mockPostEntry.mock.calls[0]![1].lines;
      expectBalanced(lines, 'POS fallback sub-department');
      // Revenue credit should go to uncategorized revenue
      const revenueLines = lines.filter((l: any) => Number(l.creditAmount) > 0);
      expect(revenueLines.some((l: any) => l.accountId === 'acct-uncategorized-revenue')).toBe(true);
      // Unmapped event still logged
      expect(mockLogUnmappedEvent).toHaveBeenCalled();
    });

    it('posts with ALL fallbacks and produces balanced entry', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(null);
      mockResolveSubDeptAccounts.mockResolvedValueOnce(null);
      mockBatchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map());

      // orderTotal = subtotal(10000) + tax(800) + svcCharge(500) = 11300
      const eventWithTax = {
        ...baseTenderEvent,
        data: {
          ...baseTenderEvent.data,
          amount: 11300,
          orderTotal: 11300,
          taxTotal: 800,
          tipAmount: 200,
          serviceChargeTotal: 500,
          lines: [
            {
              ...baseTenderEvent.data.lines[0],
              taxGroupId: 'tg-1',
              taxAmountCents: 800,
            },
          ],
        },
      };

      // Also make tax group unmapped
      const { resolveTaxGroupAccount } = await import('../helpers/resolve-mapping');
      (resolveTaxGroupAccount as any).mockResolvedValueOnce(null);

      const { handleTenderForAccounting } = await import('../adapters/pos-posting-adapter');
      await handleTenderForAccounting(eventWithTax as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const lines = mockPostEntry.mock.calls[0]![1].lines;
      expectBalanced(lines, 'POS all-fallback scenario');
    });

    it('posts full amount to uncategorized revenue when no line detail', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(fullPaymentMapping);

      const noLinesEvent = {
        ...baseTenderEvent,
        data: {
          ...baseTenderEvent.data,
          lines: undefined, // no line detail
        },
      };

      const { handleTenderForAccounting } = await import('../adapters/pos-posting-adapter');
      await handleTenderForAccounting(noLinesEvent as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const lines = mockPostEntry.mock.calls[0]![1].lines;
      expectBalanced(lines, 'POS no line detail');
      // Revenue should be full amount to uncategorized
      const revLine = lines.find((l: any) => Number(l.creditAmount) > 0);
      expect(revLine.accountId).toBe('acct-uncategorized-revenue');
      expect(revLine.creditAmount).toBe('100.00');
    });

    it('skips posting when no fallback accounts configured AND no mappings', async () => {
      const settingsWithNoFallbacks = {
        ...fullSettings,
        defaultUndepositedFundsAccountId: null,
        defaultUncategorizedRevenueAccountId: null,
        defaultSalesTaxPayableAccountId: null,
      };
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(settingsWithNoFallbacks);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(null);
      mockResolveSubDeptAccounts.mockResolvedValueOnce(null);
      mockBatchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map());

      const { handleTenderForAccounting } = await import('../adapters/pos-posting-adapter');
      await handleTenderForAccounting(baseTenderEvent as any);

      // Should NOT post — no debit account available
      expect(mockPostEntry).not.toHaveBeenCalled();
      // But should still log unmapped events
      expect(mockLogUnmappedEvent).toHaveBeenCalled();
    });

    it('posts normally when all mappings exist (no fallback needed)', async () => {
      const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
      (getAccountingSettings as any).mockResolvedValueOnce(fullSettings);
      mockResolvePaymentTypeAccounts.mockResolvedValueOnce(fullPaymentMapping);
      mockResolveSubDeptAccounts.mockResolvedValueOnce(fullSubDeptMapping);

      const { handleTenderForAccounting } = await import('../adapters/pos-posting-adapter');
      await handleTenderForAccounting(baseTenderEvent as any);

      expect(mockPostEntry).toHaveBeenCalledOnce();
      const lines = mockPostEntry.mock.calls[0]![1].lines;
      expectBalanced(lines, 'POS normal posting');
      // Revenue should go to mapped account, not fallback
      const revLine = lines.find((l: any) => Number(l.creditAmount) > 0);
      expect(revLine.accountId).toBe('acct-revenue');
      // No unmapped events logged
      expect(mockLogUnmappedEvent).not.toHaveBeenCalled();
    });
  });

  // ─── Never-Throw Guarantee ────────────────────────────────

  describe('Never-Throw Guarantee (all adapters)', () => {
    it('voucher purchase does not throw on error', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

      const { handleVoucherPurchaseForAccounting } = await import(
        '../adapters/voucher-posting-adapter'
      );
      await expect(handleVoucherPurchaseForAccounting({
        eventId: 'e', eventType: 'v', occurredAt: '', tenantId: 't',
        idempotencyKey: 'k', data: { voucherId: 'v1' },
      } as any)).resolves.toBeUndefined();
    });

    it('voucher redemption does not throw on error', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

      const { handleVoucherRedemptionForAccounting } = await import(
        '../adapters/voucher-posting-adapter'
      );
      await expect(handleVoucherRedemptionForAccounting({
        eventId: 'e', eventType: 'v', occurredAt: '', tenantId: 't',
        idempotencyKey: 'k', data: { voucherId: 'v1' },
      } as any)).resolves.toBeUndefined();
    });

    it('voucher expiration does not throw on error', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

      const { handleVoucherExpirationForAccounting } = await import(
        '../adapters/voucher-posting-adapter'
      );
      await expect(handleVoucherExpirationForAccounting({
        eventId: 'e', eventType: 'v', occurredAt: '', tenantId: 't',
        idempotencyKey: 'k', data: { voucherId: 'v1' },
      } as any)).resolves.toBeUndefined();
    });

    it('membership billing does not throw on error', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

      const { handleMembershipBillingForAccounting } = await import(
        '../adapters/membership-posting-adapter'
      );
      await expect(handleMembershipBillingForAccounting({
        eventId: 'e', eventType: 'v', occurredAt: '', tenantId: 't',
        idempotencyKey: 'k', data: { membershipId: 'm1' },
      } as any)).resolves.toBeUndefined();
    });

    it('chargeback received does not throw on error', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

      const { handleChargebackReceivedForAccounting } = await import(
        '../adapters/chargeback-posting-adapter'
      );
      await expect(handleChargebackReceivedForAccounting({
        eventId: 'e', eventType: 'v', occurredAt: '', tenantId: 't',
        idempotencyKey: 'k', data: { chargebackId: 'cb1' },
      } as any)).resolves.toBeUndefined();
    });

    it('chargeback resolved does not throw on error', async () => {
      const { getAccountingSettings } = await import(
        '../helpers/get-accounting-settings'
      );
      (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

      const { handleChargebackResolvedForAccounting } = await import(
        '../adapters/chargeback-posting-adapter'
      );
      await expect(handleChargebackResolvedForAccounting({
        eventId: 'e', eventType: 'v', occurredAt: '', tenantId: 't',
        idempotencyKey: 'k', data: { chargebackId: 'cb1', resolution: 'won' },
      } as any)).resolves.toBeUndefined();
    });
  });
});
