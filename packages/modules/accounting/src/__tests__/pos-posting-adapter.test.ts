import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const resolveSubDepartmentAccounts = vi.fn();
  const resolvePaymentTypeAccounts = vi.fn();
  const resolveTaxGroupAccount = vi.fn();
  const batchResolveSubDepartmentAccounts = vi.fn();
  const batchResolveTaxGroupAccounts = vi.fn();
  const batchResolveDiscountGlMappings = vi.fn();
  const logUnmappedEvent = vi.fn();
  const getAccountingSettings = vi.fn();
  const postEntry = vi.fn();
  const getAccountingPostingApi = vi.fn();

  return {
    resolveSubDepartmentAccounts,
    resolvePaymentTypeAccounts,
    resolveTaxGroupAccount,
    batchResolveSubDepartmentAccounts,
    batchResolveTaxGroupAccounts,
    batchResolveDiscountGlMappings,
    logUnmappedEvent,
    getAccountingSettings,
    postEntry,
    getAccountingPostingApi,
  };
});

vi.mock('@oppsera/db', () => ({
  db: {},
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => `ulid-${Math.random().toString(36).slice(2, 8)}`),
}));

vi.mock('../helpers/resolve-mapping', () => ({
  resolveSubDepartmentAccounts: mocks.resolveSubDepartmentAccounts,
  resolvePaymentTypeAccounts: mocks.resolvePaymentTypeAccounts,
  resolveTaxGroupAccount: mocks.resolveTaxGroupAccount,
  batchResolveSubDepartmentAccounts: mocks.batchResolveSubDepartmentAccounts,
  batchResolveTaxGroupAccounts: mocks.batchResolveTaxGroupAccounts,
  batchResolveDiscountGlMappings: mocks.batchResolveDiscountGlMappings,
  logUnmappedEvent: mocks.logUnmappedEvent,
}));

vi.mock('../helpers/get-accounting-settings', () => ({
  getAccountingSettings: mocks.getAccountingSettings,
}));

vi.mock('@oppsera/core/helpers/accounting-posting-api', () => ({
  getAccountingPostingApi: mocks.getAccountingPostingApi,
}));

import { handleTenderForAccounting } from '../adapters/pos-posting-adapter';
import type { EventEnvelope } from '@oppsera/shared';

function createEvent(dataOverrides: Record<string, unknown> = {}): EventEnvelope {
  return {
    eventId: 'evt-1',
    eventType: 'tender.recorded.v1',
    tenantId: 'tenant-1',
    occurredAt: new Date().toISOString(),
    data: {
      tenderId: 'tender-1',
      orderId: 'order-1',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      tenderType: 'cash',
      amount: 2000,
      tipAmount: 0,
      customerId: null,
      businessDate: '2026-01-15',
      discountTotal: 0,
      serviceChargeTotal: 0,
      ...dataOverrides,
    },
  } as unknown as EventEnvelope;
}

const defaultSettings = {
  enableCogsPosting: false,
  enableUndepositedFundsWorkflow: false,
  defaultTipsPayableAccountId: null,
  defaultServiceChargeRevenueAccountId: null,
  defaultUncategorizedRevenueAccountId: 'acct-uncat',
};

const defaultSubDeptMapping = {
  subDepartmentId: 'subdept-1',
  revenueAccountId: 'acct-rev',
  cogsAccountId: null,
  inventoryAccountId: null,
  discountAccountId: null,
  returnsAccountId: null,
};

const defaultPaymentMapping = {
  paymentTypeId: 'cash',
  depositAccountId: 'acct-cash',
  clearingAccountId: null,
  feeExpenseAccountId: null,
};

function singleLine(overrides: Record<string, unknown> = {}) {
  return {
    catalogItemId: 'item-1',
    catalogItemName: 'Widget',
    subDepartmentId: 'subdept-1',
    qty: 1,
    extendedPriceCents: 2000,
    taxGroupId: null,
    taxAmountCents: 0,
    costCents: null,
    packageComponents: null,
    ...overrides,
  };
}

describe('handleTenderForAccounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccountingPostingApi.mockReturnValue({ postEntry: mocks.postEntry });
    mocks.getAccountingSettings.mockResolvedValue(defaultSettings);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValue(new Map([['subdept-1', defaultSubDeptMapping]]));
    mocks.batchResolveTaxGroupAccounts.mockResolvedValue(new Map());
    mocks.batchResolveDiscountGlMappings.mockResolvedValue(new Map());
    mocks.logUnmappedEvent.mockResolvedValue(undefined);
    mocks.postEntry.mockResolvedValue(undefined);
  });

  // ── Core behavior ──────────────────────────────────────────────

  it('should skip silently when accounting is not enabled', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce(null);

    await handleTenderForAccounting(createEvent());

    expect(mocks.resolvePaymentTypeAccounts).not.toHaveBeenCalled();
    expect(mocks.postEntry).not.toHaveBeenCalled();
  });

  it('should use tenderType field for payment method resolution', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);

    await handleTenderForAccounting(createEvent({
      tenderType: 'cash',
      lines: [singleLine()],
    }));

    expect(mocks.resolvePaymentTypeAccounts).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      'cash',
    );
  });

  it('should fall back to paymentMethod when tenderType is absent', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      ...defaultPaymentMapping,
      paymentTypeId: 'card',
      depositAccountId: 'acct-card',
    });

    await handleTenderForAccounting(createEvent({
      tenderType: undefined,
      paymentMethod: 'card',
      lines: [],
    }));

    expect(mocks.resolvePaymentTypeAccounts).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      'card',
    );
  });

  it('should log no_line_detail when event has no lines', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);

    await handleTenderForAccounting(createEvent());

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({ reason: expect.stringContaining('no_line_detail') }),
    );
  });

  it('should post GL entry for single item with subdepartment mapping', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-1', { ...defaultSubDeptMapping, revenueAccountId: 'acct-rev-100' }],
    ]));

    await handleTenderForAccounting(createEvent({
      lines: [singleLine()],
    }));

    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceModule: 'pos',
        sourceReferenceId: 'tender-1',
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct-cash', debitAmount: '20.00', creditAmount: '0' }),
          expect.objectContaining({ accountId: 'acct-rev-100', debitAmount: '0', creditAmount: '20.00' }),
        ]),
      }),
    );
  });

  it('should split package revenue across component subdepartments', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-food', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-food', revenueAccountId: 'acct-rev-food' }],
      ['subdept-bev', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-bev', revenueAccountId: 'acct-rev-bev' }],
    ]));

    await handleTenderForAccounting(createEvent({
      amount: 3000,
      lines: [{
        catalogItemId: 'pkg-1',
        catalogItemName: 'Dinner Package',
        subDepartmentId: 'subdept-pkg',
        qty: 1,
        extendedPriceCents: 3000,
        taxGroupId: null,
        taxAmountCents: 0,
        costCents: null,
        packageComponents: [
          { catalogItemId: 'food-1', catalogItemName: 'Steak', subDepartmentId: 'subdept-food', qty: 1, componentUnitPriceCents: 2500, componentExtendedCents: 2500, allocatedRevenueCents: 2000, allocationWeight: 0.667 },
          { catalogItemId: 'bev-1', catalogItemName: 'Wine', subDepartmentId: 'subdept-bev', qty: 1, componentUnitPriceCents: 1500, componentExtendedCents: 1500, allocatedRevenueCents: 1000, allocationWeight: 0.333 },
        ],
      }],
    }));

    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct-cash', debitAmount: '30.00' }),
          expect.objectContaining({ accountId: 'acct-rev-food', creditAmount: '20.00' }),
          expect.objectContaining({ accountId: 'acct-rev-bev', creditAmount: '10.00' }),
        ]),
      }),
    );
  });

  it('should log unmapped event for missing subdepartment mapping without blocking', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // beforeEach batch mock returns Map without 'subdept-unmapped' key — simulates missing mapping

    await handleTenderForAccounting(createEvent({
      lines: [singleLine({ subDepartmentId: 'subdept-unmapped' })],
    }));

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({
        entityType: 'sub_department',
        entityId: 'subdept-unmapped',
      }),
    );
  });

  it('should log unmapped event for null subdepartment on line', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);

    await handleTenderForAccounting(createEvent({
      lines: [singleLine({ subDepartmentId: null })],
    }));

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({
        entityType: 'sub_department',
        entityId: 'unmapped',
      }),
    );
  });

  it('should handle tax group resolution', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock
    mocks.batchResolveTaxGroupAccounts.mockResolvedValueOnce(new Map([
      ['tax-grp-1', 'acct-tax-payable'],
    ]));

    await handleTenderForAccounting(createEvent({
      amount: 2200,
      lines: [singleLine({ extendedPriceCents: 2000, taxGroupId: 'tax-grp-1', taxAmountCents: 200 })],
    }));

    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct-tax-payable', creditAmount: '2.00' }),
        ]),
      }),
    );
  });

  it('should handle backward-compat event without lines (falls through to no_line_detail)', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);

    await handleTenderForAccounting(createEvent({ lines: undefined }));

    // Unmapped event still logged for missing line detail
    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({ reason: expect.stringContaining('no_line_detail') }),
    );
    // With fallback uncategorized revenue account, GL still posts (debit + fallback credit)
    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ memo: 'Revenue - no line detail (fallback: uncategorized)' }),
        ]),
      }),
    );
  });

  it('should never throw (POS adapter must not block tenders)', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock
    mocks.postEntry.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(handleTenderForAccounting(createEvent({
      lines: [singleLine()],
    }))).resolves.toBeUndefined();

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({ entityType: 'posting_error' }),
    );
  });

  // ── Proportional allocation (Session 37) ───────────────────────

  it('should post proportional share for non-final tender in a split', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock
    mocks.batchResolveTaxGroupAccounts.mockResolvedValueOnce(new Map([['tax-1', 'acct-tax']]));

    // Order total is 10000 cents ($100), this tender is 5000 cents ($50) — ratio = 0.5
    await handleTenderForAccounting(createEvent({
      amount: 5000,
      orderTotal: 10000,
      tenderSequence: 1,
      isFullyPaid: false,
      totalTendered: 5000,
      lines: [singleLine({ qty: 2, extendedPriceCents: 8000, taxGroupId: 'tax-1', taxAmountCents: 2000 })],
    }));

    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct-cash', debitAmount: '50.00', creditAmount: '0' }),
          expect.objectContaining({ accountId: 'acct-rev', debitAmount: '0', creditAmount: '40.00' }),
          expect.objectContaining({ accountId: 'acct-tax', debitAmount: '0', creditAmount: '10.00' }),
        ]),
      }),
    );
  });

  it('should post proportional share for final tender in a 2-way split', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      ...defaultPaymentMapping,
      paymentTypeId: 'card',
      depositAccountId: 'acct-card',
    });
    // subdept-1 already in beforeEach batch mock
    mocks.batchResolveTaxGroupAccounts.mockResolvedValueOnce(new Map([['tax-1', 'acct-tax']]));

    await handleTenderForAccounting(createEvent({
      amount: 5000,
      orderTotal: 10000,
      tenderSequence: 2,
      isFullyPaid: true,
      totalTendered: 10000,
      tenderType: 'card',
      lines: [singleLine({ qty: 2, extendedPriceCents: 8000, taxGroupId: 'tax-1', taxAmountCents: 2000 })],
    }));

    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct-card', debitAmount: '50.00' }),
          expect.objectContaining({ accountId: 'acct-rev', creditAmount: '40.00' }),
          expect.objectContaining({ accountId: 'acct-tax', creditAmount: '10.00' }),
        ]),
      }),
    );
  });

  it('should handle single tender as full ratio (1.0)', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    await handleTenderForAccounting(createEvent({
      amount: 2000,
      orderTotal: 2000,
      tenderSequence: 1,
      isFullyPaid: true,
      totalTendered: 2000,
      lines: [singleLine()],
    }));

    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ debitAmount: '20.00' }),
          expect.objectContaining({ creditAmount: '20.00' }),
        ]),
      }),
    );
  });

  it('should handle 3-way split with proportional allocation', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock
    mocks.batchResolveTaxGroupAccounts.mockResolvedValueOnce(new Map([['tax-1', 'acct-tax']]));

    // Order: $99 (9900 cents) — 3-way split: $33 each
    await handleTenderForAccounting(createEvent({
      amount: 3300,
      orderTotal: 9900,
      tenderSequence: 1,
      isFullyPaid: false,
      totalTendered: 3300,
      lines: [singleLine({ extendedPriceCents: 9000, taxGroupId: 'tax-1', taxAmountCents: 900 })],
    }));

    // Ratio = 3300/9900 = 1/3
    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct-cash', debitAmount: '33.00' }),
          expect.objectContaining({ accountId: 'acct-rev', creditAmount: '30.00' }),
          expect.objectContaining({ accountId: 'acct-tax', creditAmount: '3.00' }),
        ]),
      }),
    );
  });

  it('should apply proportional ratio to COGS and inventory when enabled', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      cogsPostingMode: 'perpetual',
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-1', { ...defaultSubDeptMapping, cogsAccountId: 'acct-cogs', inventoryAccountId: 'acct-inv' }],
    ]));

    // 50% split
    await handleTenderForAccounting(createEvent({
      amount: 5000,
      orderTotal: 10000,
      tenderSequence: 1,
      isFullyPaid: false,
      lines: [singleLine({ qty: 2, extendedPriceCents: 10000, costCents: 2000 })],
    }));

    // COGS: Math.round(2000 * 2 * 0.5) = 2000 → $20.00
    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct-cogs', debitAmount: '20.00' }),
          expect.objectContaining({ accountId: 'acct-inv', creditAmount: '20.00' }),
        ]),
      }),
    );
  });

  it('should apply proportional ratio to package component revenue', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-food', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-food', revenueAccountId: 'acct-rev-food' }],
      ['subdept-bev', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-bev', revenueAccountId: 'acct-rev-bev' }],
    ]));

    // 50% split of a package order
    await handleTenderForAccounting(createEvent({
      amount: 2500,
      orderTotal: 5000,
      tenderSequence: 1,
      isFullyPaid: false,
      lines: [{
        catalogItemId: 'pkg-1',
        catalogItemName: 'Combo',
        subDepartmentId: 'subdept-pkg',
        qty: 1,
        extendedPriceCents: 5000,
        taxGroupId: null,
        taxAmountCents: 0,
        costCents: null,
        packageComponents: [
          { catalogItemId: 'food-1', catalogItemName: 'Burger', subDepartmentId: 'subdept-food', qty: 1, componentUnitPriceCents: 3000, componentExtendedCents: 3000, allocatedRevenueCents: 3000, allocationWeight: 0.6 },
          { catalogItemId: 'bev-1', catalogItemName: 'Soda', subDepartmentId: 'subdept-bev', qty: 1, componentUnitPriceCents: 2000, componentExtendedCents: 2000, allocatedRevenueCents: 2000, allocationWeight: 0.4 },
        ],
      }],
    }));

    // Food: Math.round(3000 * 0.5) = 1500 → $15.00
    // Bev: Math.round(2000 * 0.5) = 1000 → $10.00
    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct-cash', debitAmount: '25.00' }),
          expect.objectContaining({ accountId: 'acct-rev-food', creditAmount: '15.00' }),
          expect.objectContaining({ accountId: 'acct-rev-bev', creditAmount: '10.00' }),
        ]),
      }),
    );
  });

  it('should skip posting for zero-dollar order', async () => {
    await handleTenderForAccounting(createEvent({
      amount: 0,
      orderTotal: 0,
    }));

    expect(mocks.postEntry).not.toHaveBeenCalled();
  });

  it('should fall back to amount as orderTotal when orderTotal is missing (legacy events)', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    await handleTenderForAccounting(createEvent({
      amount: 3000,
      lines: [singleLine({ extendedPriceCents: 3000 })],
    }));

    // Full amount posted (ratio 1.0)
    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ debitAmount: '30.00' }),
          expect.objectContaining({ creditAmount: '30.00' }),
        ]),
      }),
    );
  });

  it('should use clearing account when undeposited funds workflow is enabled', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      enableUndepositedFundsWorkflow: true,
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'card',
      depositAccountId: 'acct-card-deposit',
      clearingAccountId: 'acct-card-clearing',
      feeExpenseAccountId: null,
    });
    // subdept-1 already in beforeEach batch mock

    await handleTenderForAccounting(createEvent({
      tenderType: 'card',
      amount: 2000,
      orderTotal: 2000,
      lines: [singleLine()],
    }));

    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct-card-clearing', debitAmount: '20.00' }),
        ]),
      }),
    );
  });

  it('should handle mixed package with components in different subdepartments', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-food', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-food', revenueAccountId: 'acct-rev-food' }],
      ['subdept-bev', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-bev', revenueAccountId: 'acct-rev-bev' }],
      ['subdept-retail', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-retail', revenueAccountId: 'acct-rev-retail' }],
    ]));

    await handleTenderForAccounting(createEvent({
      amount: 5000,
      lines: [
        {
          catalogItemId: 'pkg-1',
          catalogItemName: 'Dinner Package',
          subDepartmentId: 'subdept-pkg',
          qty: 1,
          extendedPriceCents: 3000,
          taxGroupId: null,
          taxAmountCents: 0,
          costCents: null,
          packageComponents: [
            { catalogItemId: 'food-1', catalogItemName: 'Steak', subDepartmentId: 'subdept-food', qty: 1, componentUnitPriceCents: 2000, componentExtendedCents: 2000, allocatedRevenueCents: 1800, allocationWeight: 0.6 },
            { catalogItemId: 'bev-1', catalogItemName: 'Wine', subDepartmentId: 'subdept-bev', qty: 1, componentUnitPriceCents: 1500, componentExtendedCents: 1500, allocatedRevenueCents: 1200, allocationWeight: 0.4 },
          ],
        },
        {
          catalogItemId: 'item-2',
          catalogItemName: 'T-Shirt',
          subDepartmentId: 'subdept-retail',
          qty: 1,
          extendedPriceCents: 2000,
          taxGroupId: null,
          taxAmountCents: 0,
          costCents: null,
          packageComponents: null,
        },
      ],
    }));

    expect(mocks.postEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'acct-cash', debitAmount: '50.00' }),
          expect.objectContaining({ accountId: 'acct-rev-food', creditAmount: '18.00' }),
          expect.objectContaining({ accountId: 'acct-rev-bev', creditAmount: '12.00' }),
          expect.objectContaining({ accountId: 'acct-rev-retail', creditAmount: '20.00' }),
        ]),
      }),
    );
  });

  // ── Session 38: Tips ───────────────────────────────────────────

  it('should post tip credit to tips payable account and include tip in debit', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      defaultTipsPayableAccountId: 'acct-tips-payable',
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    await handleTenderForAccounting(createEvent({
      amount: 2000,
      orderTotal: 2000,
      tipAmount: 300,
      lines: [singleLine()],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    // Debit: amount + tip = $20 + $3 = $23
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-cash', debitAmount: '23.00' }),
    ]));
    // Credit: tips payable $3
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-tips-payable', creditAmount: '3.00', memo: 'Tips payable' }),
    ]));
    // Credit: revenue $20
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-rev', creditAmount: '20.00' }),
    ]));
  });

  it('should not post tip lines when tipAmount is 0', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      defaultTipsPayableAccountId: 'acct-tips-payable',
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    await handleTenderForAccounting(createEvent({
      amount: 2000,
      orderTotal: 2000,
      tipAmount: 0,
      lines: [singleLine()],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    // No tips payable line
    expect(postedLines).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ memo: 'Tips payable' }),
    ]));
    // Debit is just the tender amount
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-cash', debitAmount: '20.00' }),
    ]));
  });

  it('should log unmapped event when tip exists but no tips payable account configured', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      defaultTipsPayableAccountId: null,
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    await handleTenderForAccounting(createEvent({
      amount: 2000,
      orderTotal: 2000,
      tipAmount: 500,
      lines: [singleLine()],
    }));

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({
        entityType: 'tips_payable_account',
        reason: expect.stringContaining('tips_payable_account:missing'),
      }),
    );
  });

  it('should include tip in debit even when tips payable account is missing', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      defaultTipsPayableAccountId: null,
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    await handleTenderForAccounting(createEvent({
      amount: 2000,
      orderTotal: 2000,
      tipAmount: 300,
      lines: [singleLine()],
    }));

    // Debit still includes tip (cash was received)
    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-cash', debitAmount: '23.00' }),
    ]));
  });

  // ── Session 38: Service charges ────────────────────────────────

  it('should post service charge credit to service charge revenue account (proportional)', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      defaultServiceChargeRevenueAccountId: 'acct-svc-rev',
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    // Order: $20 subtotal + $2 svc charge + $0 tax = $22 total
    await handleTenderForAccounting(createEvent({
      amount: 2200,
      orderTotal: 2200,
      serviceChargeTotal: 200,
      lines: [singleLine()],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-cash', debitAmount: '22.00' }),
      expect.objectContaining({ accountId: 'acct-rev', creditAmount: '20.00' }),
      expect.objectContaining({ accountId: 'acct-svc-rev', creditAmount: '2.00', memo: 'Service charge revenue' }),
    ]));
  });

  it('should post proportional service charge for split tender', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      defaultServiceChargeRevenueAccountId: 'acct-svc-rev',
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    // 50% split: order total = $44, svc charge = $4, this tender = $22
    await handleTenderForAccounting(createEvent({
      amount: 2200,
      orderTotal: 4400,
      serviceChargeTotal: 400,
      lines: [singleLine({ extendedPriceCents: 4000 })],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    // Svc charge: Math.round(400 * 0.5) = 200 → $2.00
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-svc-rev', creditAmount: '2.00' }),
    ]));
  });

  it('should not post service charge when serviceChargeTotal is 0', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      defaultServiceChargeRevenueAccountId: 'acct-svc-rev',
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    await handleTenderForAccounting(createEvent({
      amount: 2000,
      orderTotal: 2000,
      serviceChargeTotal: 0,
      lines: [singleLine()],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    expect(postedLines).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ memo: 'Service charge revenue' }),
    ]));
  });

  it('should log unmapped event when service charge exists but no account configured', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      defaultServiceChargeRevenueAccountId: null,
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    await handleTenderForAccounting(createEvent({
      amount: 2200,
      orderTotal: 2200,
      serviceChargeTotal: 200,
      lines: [singleLine()],
    }));

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({
        entityType: 'service_charge_account',
        reason: expect.stringContaining('service_charge_account:missing'),
      }),
    );
  });

  // ── Session 38: Discounts ──────────────────────────────────────

  it('should post discount debit (contra-revenue) distributed by sub-department', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-1', { ...defaultSubDeptMapping, discountAccountId: 'acct-discount' }],
    ]));

    // Order: $20 subtotal, $5 discount, total = $15
    await handleTenderForAccounting(createEvent({
      amount: 1500,
      orderTotal: 1500,
      discountTotal: 500,
      lines: [singleLine()],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    // Debit: cash $15
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-cash', debitAmount: '15.00' }),
    ]));
    // Credit: revenue $20
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-rev', creditAmount: '20.00' }),
    ]));
    // Debit: discount $5 (contra-revenue)
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-discount', debitAmount: '5.00', memo: expect.stringContaining('Discount') }),
    ]));
  });

  it('should distribute discount proportionally across multiple sub-departments', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      // Sub-dept A: $60 of $100 revenue (60% share)
      ['subdept-a', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-a', revenueAccountId: 'acct-rev-a', discountAccountId: 'acct-discount-a' }],
      // Sub-dept B: $40 of $100 revenue (40% share)
      ['subdept-b', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-b', revenueAccountId: 'acct-rev-b', discountAccountId: 'acct-discount-b' }],
    ]));

    // Order: $100 subtotal, $10 discount, total = $90
    await handleTenderForAccounting(createEvent({
      amount: 9000,
      orderTotal: 9000,
      discountTotal: 1000,
      lines: [
        singleLine({ subDepartmentId: 'subdept-a', extendedPriceCents: 6000 }),
        singleLine({ subDepartmentId: 'subdept-b', extendedPriceCents: 4000, catalogItemId: 'item-2' }),
      ],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    // Discount A: Math.round(1000 * 1.0 * (6000 / 10000)) = 600 → $6.00
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-discount-a', debitAmount: '6.00' }),
    ]));
    // Discount B: Math.round(1000 * 1.0 * (4000 / 10000)) = 400 → $4.00
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-discount-b', debitAmount: '4.00' }),
    ]));
  });

  it('should not post discount when discountTotal is 0', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-1', { ...defaultSubDeptMapping, discountAccountId: 'acct-discount' }],
    ]));

    await handleTenderForAccounting(createEvent({
      amount: 2000,
      orderTotal: 2000,
      discountTotal: 0,
      lines: [singleLine()],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    expect(postedLines).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ memo: expect.stringContaining('Discount') }),
    ]));
  });

  it('should log unmapped event when discount exists but no discount account configured', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // beforeEach batch mock already has subdept-1 with discountAccountId: null

    await handleTenderForAccounting(createEvent({
      amount: 1500,
      orderTotal: 1500,
      discountTotal: 500,
      lines: [singleLine()],
    }));

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({
        entityType: 'discount_account',
        reason: expect.stringContaining('discount_account:subdept-1'),
      }),
    );
  });

  it('should apply proportional ratio to discount for split tender', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-1', { ...defaultSubDeptMapping, discountAccountId: 'acct-discount' }],
    ]));

    // 50% split: order = $30, discount = $10, this tender = $15
    await handleTenderForAccounting(createEvent({
      amount: 1500,
      orderTotal: 3000,
      discountTotal: 1000,
      lines: [singleLine({ extendedPriceCents: 3000 })],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    // Discount: Math.round(1000 * 0.5 * (1500 / 1500)) = 500 → $5.00
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-discount', debitAmount: '5.00' }),
    ]));
  });

  // ── Session 38: Full balanced journal ──────────────────────────

  it('should produce a balanced journal with all categories (revenue + tax + discount + svc charge + tip)', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      defaultTipsPayableAccountId: 'acct-tips-payable',
      defaultServiceChargeRevenueAccountId: 'acct-svc-rev',
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-1', { ...defaultSubDeptMapping, revenueAccountId: 'acct-rev', discountAccountId: 'acct-discount' }],
    ]));
    mocks.batchResolveTaxGroupAccounts.mockResolvedValueOnce(new Map([['tax-1', 'acct-tax']]));

    // Order:
    //   subtotal (extendedPrice) = $100 (10000 cents)
    //   discountTotal = $10 (1000 cents)
    //   serviceChargeTotal = $5 (500 cents)
    //   taxTotal = $9 (900 cents)
    //   total = 100 - 10 + 5 + 9 = $104 (10400 cents)
    //   tipAmount = $5 (500 cents)
    await handleTenderForAccounting(createEvent({
      amount: 10400,
      orderTotal: 10400,
      discountTotal: 1000,
      serviceChargeTotal: 500,
      tipAmount: 500,
      lines: [singleLine({ extendedPriceCents: 10000, taxGroupId: 'tax-1', taxAmountCents: 900 })],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;

    // Parse into debits and credits
    let totalDebits = 0;
    let totalCredits = 0;
    for (const line of postedLines) {
      totalDebits += parseFloat(line.debitAmount);
      totalCredits += parseFloat(line.creditAmount);
    }

    // Debits: Cash ($104 + $5 tip = $109) + Discount ($10) = $119
    // Credits: Revenue ($100) + Svc Charge ($5) + Tax ($9) + Tips ($5) = $119
    expect(totalDebits).toBeCloseTo(119, 2);
    expect(totalCredits).toBeCloseTo(119, 2);

    // Verify individual lines exist
    expect(postedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'acct-cash', debitAmount: '109.00' }),
      expect.objectContaining({ accountId: 'acct-rev', creditAmount: '100.00' }),
      expect.objectContaining({ accountId: 'acct-discount', debitAmount: '10.00' }),
      expect.objectContaining({ accountId: 'acct-svc-rev', creditAmount: '5.00' }),
      expect.objectContaining({ accountId: 'acct-tax', creditAmount: '9.00' }),
      expect.objectContaining({ accountId: 'acct-tips-payable', creditAmount: '5.00' }),
    ]));
  });

  // ── Session 40: GL dimensions ─────────────────────────────────

  it('should set channel=pos on all GL lines', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      defaultTipsPayableAccountId: 'acct-tips-payable',
      defaultServiceChargeRevenueAccountId: 'acct-svc-rev',
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-1', { ...defaultSubDeptMapping, discountAccountId: 'acct-discount' }],
    ]));
    mocks.batchResolveTaxGroupAccounts.mockResolvedValueOnce(new Map([['tax-1', 'acct-tax']]));

    await handleTenderForAccounting(createEvent({
      amount: 10400,
      orderTotal: 10400,
      discountTotal: 1000,
      serviceChargeTotal: 500,
      tipAmount: 500,
      lines: [singleLine({ extendedPriceCents: 10000, taxGroupId: 'tax-1', taxAmountCents: 900 })],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    for (const line of postedLines) {
      expect(line.channel).toBe('pos');
    }
  });

  it('should populate terminalId from event on all GL lines', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    await handleTenderForAccounting(createEvent({
      terminalId: 'terminal-42',
      lines: [singleLine()],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    for (const line of postedLines) {
      expect(line.terminalId).toBe('terminal-42');
    }
  });

  it('should set subDepartmentId on revenue lines', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-food', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-food', revenueAccountId: 'acct-rev-food' }],
    ]));

    await handleTenderForAccounting(createEvent({
      lines: [singleLine({ subDepartmentId: 'subdept-food' })],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    const revenueLine = postedLines.find((l: Record<string, string>) => l.memo?.includes('Revenue'));
    expect(revenueLine).toBeDefined();
    expect(revenueLine.subDepartmentId).toBe('subdept-food');
  });

  it('should set subDepartmentId on discount lines', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-food', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-food', revenueAccountId: 'acct-rev-food', discountAccountId: 'acct-discount' }],
    ]));

    await handleTenderForAccounting(createEvent({
      amount: 1500,
      orderTotal: 1500,
      discountTotal: 500,
      lines: [singleLine({ subDepartmentId: 'subdept-food' })],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    const discountLine = postedLines.find((l: Record<string, string>) => l.memo?.includes('Discount'));
    expect(discountLine).toBeDefined();
    expect(discountLine.subDepartmentId).toBe('subdept-food');
  });

  it('should set subDepartmentId on COGS and inventory lines', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      cogsPostingMode: 'perpetual',
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-food', { ...defaultSubDeptMapping, subDepartmentId: 'subdept-food', revenueAccountId: 'acct-rev', cogsAccountId: 'acct-cogs', inventoryAccountId: 'acct-inv' }],
    ]));

    await handleTenderForAccounting(createEvent({
      amount: 2000,
      orderTotal: 2000,
      lines: [singleLine({ subDepartmentId: 'subdept-food', costCents: 500 })],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    const cogsLine = postedLines.find((l: Record<string, string>) => l.memo?.includes('COGS'));
    const invLine = postedLines.find((l: Record<string, string>) => l.memo?.includes('Inventory'));
    expect(cogsLine?.subDepartmentId).toBe('subdept-food');
    expect(invLine?.subDepartmentId).toBe('subdept-food');
  });

  it('should handle missing terminalId gracefully (undefined)', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    // subdept-1 already in beforeEach batch mock

    await handleTenderForAccounting(createEvent({
      terminalId: undefined,
      lines: [singleLine()],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;
    for (const line of postedLines) {
      expect(line.terminalId).toBeUndefined();
      expect(line.channel).toBe('pos');
    }
  });

  it('should produce a balanced journal for split tender with all categories', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce({
      ...defaultSettings,
      defaultTipsPayableAccountId: 'acct-tips-payable',
      defaultServiceChargeRevenueAccountId: 'acct-svc-rev',
    });
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce(defaultPaymentMapping);
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValueOnce(new Map([
      ['subdept-1', { ...defaultSubDeptMapping, revenueAccountId: 'acct-rev', discountAccountId: 'acct-discount' }],
    ]));
    mocks.batchResolveTaxGroupAccounts.mockResolvedValueOnce(new Map([['tax-1', 'acct-tax']]));

    // 50% split: order = $104, this tender = $52, tip = $3 on this tender
    await handleTenderForAccounting(createEvent({
      amount: 5200,
      orderTotal: 10400,
      discountTotal: 1000,
      serviceChargeTotal: 500,
      tipAmount: 300,
      tenderSequence: 1,
      isFullyPaid: false,
      lines: [singleLine({ extendedPriceCents: 10000, taxGroupId: 'tax-1', taxAmountCents: 900 })],
    }));

    const postedLines = mocks.postEntry.mock.calls[0]![1].lines;

    let totalDebits = 0;
    let totalCredits = 0;
    for (const line of postedLines) {
      totalDebits += parseFloat(line.debitAmount);
      totalCredits += parseFloat(line.creditAmount);
    }

    // tenderRatio = 5200 / 10400 = 0.5
    // Debits: Cash ($52 + $3 tip = $55) + Discount (Math.round(1000*0.5) = $5) = $60
    // Credits: Revenue (Math.round(10000*0.5) = $50) + Svc (Math.round(500*0.5) = $2.50) + Tax (Math.round(900*0.5) = $4.50) + Tips ($3) = $60
    expect(totalDebits).toBeCloseTo(60, 2);
    expect(totalCredits).toBeCloseTo(60, 2);
  });
});
