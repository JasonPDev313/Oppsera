import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const resolveSubDepartmentAccounts = vi.fn();
  const resolvePaymentTypeAccounts = vi.fn();
  const resolveTaxGroupAccount = vi.fn();
  const logUnmappedEvent = vi.fn();
  const getAccountingSettings = vi.fn();
  const postEntry = vi.fn();
  const getAccountingPostingApi = vi.fn();

  return {
    resolveSubDepartmentAccounts,
    resolvePaymentTypeAccounts,
    resolveTaxGroupAccount,
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
      ...dataOverrides,
    },
  } as unknown as EventEnvelope;
}

const defaultSettings = {
  enableCogsPosting: false,
  enableUndepositedFundsWorkflow: false,
};

describe('handleTenderForAccounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccountingPostingApi.mockReturnValue({ postEntry: mocks.postEntry });
    mocks.getAccountingSettings.mockResolvedValue(defaultSettings);
    mocks.logUnmappedEvent.mockResolvedValue(undefined);
    mocks.postEntry.mockResolvedValue(undefined);
  });

  it('should skip silently when accounting is not enabled', async () => {
    mocks.getAccountingSettings.mockResolvedValueOnce(null);

    await handleTenderForAccounting(createEvent());

    expect(mocks.resolvePaymentTypeAccounts).not.toHaveBeenCalled();
    expect(mocks.postEntry).not.toHaveBeenCalled();
  });

  it('should use tenderType field for payment method resolution', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'cash',
      depositAccountId: 'acct-cash',
      clearingAccountId: null,
      feeExpenseAccountId: null,
    });

    await handleTenderForAccounting(createEvent({
      tenderType: 'cash',
      lines: [{ catalogItemId: 'item-1', catalogItemName: 'Widget', subDepartmentId: 'subdept-1', qty: 1, extendedPriceCents: 2000, taxGroupId: null, taxAmountCents: 0, costCents: null, packageComponents: null }],
    }));

    expect(mocks.resolvePaymentTypeAccounts).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      'cash',
    );
  });

  it('should fall back to paymentMethod when tenderType is absent', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'card',
      depositAccountId: 'acct-card',
      clearingAccountId: null,
      feeExpenseAccountId: null,
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
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'cash',
      depositAccountId: 'acct-cash',
      clearingAccountId: null,
      feeExpenseAccountId: null,
    });

    await handleTenderForAccounting(createEvent());

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({ reason: expect.stringContaining('no_line_detail') }),
    );
  });

  it('should post GL entry for single item with subdepartment mapping', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'cash',
      depositAccountId: 'acct-cash',
      clearingAccountId: null,
      feeExpenseAccountId: null,
    });
    mocks.resolveSubDepartmentAccounts.mockResolvedValueOnce({
      subDepartmentId: 'subdept-1',
      revenueAccountId: 'acct-rev-100',
      cogsAccountId: null,
      inventoryAccountId: null,
    });

    await handleTenderForAccounting(createEvent({
      lines: [{
        catalogItemId: 'item-1',
        catalogItemName: 'Widget',
        subDepartmentId: 'subdept-1',
        qty: 1,
        extendedPriceCents: 2000,
        taxGroupId: null,
        taxAmountCents: 0,
        costCents: null,
        packageComponents: null,
      }],
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
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'cash',
      depositAccountId: 'acct-cash',
      clearingAccountId: null,
      feeExpenseAccountId: null,
    });
    // Two subdepartment lookups for the two components
    mocks.resolveSubDepartmentAccounts
      .mockResolvedValueOnce({
        subDepartmentId: 'subdept-food',
        revenueAccountId: 'acct-rev-food',
        cogsAccountId: null,
        inventoryAccountId: null,
      })
      .mockResolvedValueOnce({
        subDepartmentId: 'subdept-bev',
        revenueAccountId: 'acct-rev-bev',
        cogsAccountId: null,
        inventoryAccountId: null,
      });

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
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'cash',
      depositAccountId: 'acct-cash',
      clearingAccountId: null,
      feeExpenseAccountId: null,
    });
    mocks.resolveSubDepartmentAccounts.mockResolvedValueOnce(null);

    await handleTenderForAccounting(createEvent({
      lines: [{
        catalogItemId: 'item-1',
        catalogItemName: 'Widget',
        subDepartmentId: 'subdept-unmapped',
        qty: 1,
        extendedPriceCents: 2000,
        taxGroupId: null,
        taxAmountCents: 0,
        costCents: null,
        packageComponents: null,
      }],
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
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'cash',
      depositAccountId: 'acct-cash',
      clearingAccountId: null,
      feeExpenseAccountId: null,
    });

    await handleTenderForAccounting(createEvent({
      lines: [{
        catalogItemId: 'item-1',
        catalogItemName: 'Widget',
        subDepartmentId: null,
        qty: 1,
        extendedPriceCents: 2000,
        taxGroupId: null,
        taxAmountCents: 0,
        costCents: null,
        packageComponents: null,
      }],
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
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'cash',
      depositAccountId: 'acct-cash',
      clearingAccountId: null,
      feeExpenseAccountId: null,
    });
    mocks.resolveSubDepartmentAccounts.mockResolvedValueOnce({
      subDepartmentId: 'subdept-1',
      revenueAccountId: 'acct-rev',
      cogsAccountId: null,
      inventoryAccountId: null,
    });
    mocks.resolveTaxGroupAccount.mockResolvedValueOnce('acct-tax-payable');

    await handleTenderForAccounting(createEvent({
      amount: 2200,
      lines: [{
        catalogItemId: 'item-1',
        catalogItemName: 'Widget',
        subDepartmentId: 'subdept-1',
        qty: 1,
        extendedPriceCents: 2000,
        taxGroupId: 'tax-grp-1',
        taxAmountCents: 200,
        costCents: null,
        packageComponents: null,
      }],
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
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'cash',
      depositAccountId: 'acct-cash',
      clearingAccountId: null,
      feeExpenseAccountId: null,
    });

    await handleTenderForAccounting(createEvent({ lines: undefined }));

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({ reason: expect.stringContaining('no_line_detail') }),
    );
    expect(mocks.postEntry).not.toHaveBeenCalled();
  });

  it('should never throw (POS adapter must not block tenders)', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'cash',
      depositAccountId: 'acct-cash',
      clearingAccountId: null,
      feeExpenseAccountId: null,
    });
    mocks.resolveSubDepartmentAccounts.mockResolvedValueOnce({
      subDepartmentId: 'subdept-1',
      revenueAccountId: 'acct-rev',
      cogsAccountId: null,
      inventoryAccountId: null,
    });
    mocks.postEntry.mockRejectedValueOnce(new Error('DB connection lost'));

    // Should NOT throw even when posting fails
    await expect(handleTenderForAccounting(createEvent({
      lines: [{
        catalogItemId: 'item-1',
        catalogItemName: 'Widget',
        subDepartmentId: 'subdept-1',
        qty: 1,
        extendedPriceCents: 2000,
        taxGroupId: null,
        taxAmountCents: 0,
        costCents: null,
        packageComponents: null,
      }],
    }))).resolves.toBeUndefined();

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({ entityType: 'posting_error' }),
    );
  });

  it('should handle mixed package with components in different subdepartments', async () => {
    mocks.resolvePaymentTypeAccounts.mockResolvedValueOnce({
      paymentTypeId: 'cash',
      depositAccountId: 'acct-cash',
      clearingAccountId: null,
      feeExpenseAccountId: null,
    });
    // Component A maps to food
    mocks.resolveSubDepartmentAccounts.mockResolvedValueOnce({
      subDepartmentId: 'subdept-food',
      revenueAccountId: 'acct-rev-food',
      cogsAccountId: null,
      inventoryAccountId: null,
    });
    // Component B maps to beverage
    mocks.resolveSubDepartmentAccounts.mockResolvedValueOnce({
      subDepartmentId: 'subdept-bev',
      revenueAccountId: 'acct-rev-bev',
      cogsAccountId: null,
      inventoryAccountId: null,
    });
    // Regular line maps to retail
    mocks.resolveSubDepartmentAccounts.mockResolvedValueOnce({
      subDepartmentId: 'subdept-retail',
      revenueAccountId: 'acct-rev-retail',
      cogsAccountId: null,
      inventoryAccountId: null,
    });

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
});
