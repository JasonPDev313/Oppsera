import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleFnbGlPostingForAccounting } from '../adapters/fnb-posting-adapter';

vi.mock('@oppsera/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  },
  fnbGlAccountMappings: {},
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

const baseEvent = {
  id: 'evt-1',
  tenantId: 'tenant-1',
  type: 'fnb.gl.posting_created.v1',
  occurredAt: new Date().toISOString(),
  data: {
    closeBatchId: 'batch-1',
    locationId: 'loc-1',
    businessDate: '2026-02-21',
    glJournalEntryId: 'fnb-batch-batch-1',
    totalDebitCents: 15000,
    totalCreditCents: 15000,
    lineCount: 4,
    journalLines: [
      { category: 'cash_on_hand', description: 'cash payments collected', debitCents: 8000, creditCents: 0 },
      { category: 'undeposited_funds', description: 'credit card payments collected', debitCents: 7000, creditCents: 0 },
      { category: 'sales_revenue', description: 'Net sales revenue', debitCents: 0, creditCents: 12000 },
      { category: 'tax_payable', description: 'Sales tax collected', debitCents: 0, creditCents: 800 },
      { category: 'tips_payable', description: 'Credit card tips payable', debitCents: 0, creditCents: 1500 },
      { category: 'service_charge_revenue', description: 'Service charges collected', debitCents: 0, creditCents: 700 },
    ],
  },
};

describe('handleFnbGlPostingForAccounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip when no accounting settings', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce(null);

    await handleFnbGlPostingForAccounting(baseEvent as any);

    expect(mockPostEntry).not.toHaveBeenCalled();
  });

  it('should skip when no journal lines in payload', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultSalesTaxPayableAccountId: 'acct-tax',
    });

    const event = {
      ...baseEvent,
      data: { ...baseEvent.data, journalLines: [] },
    };

    await handleFnbGlPostingForAccounting(event as any);

    expect(mockPostEntry).not.toHaveBeenCalled();
  });

  it('should post GL entry using accounting settings defaults', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultUndepositedFundsAccountId: 'acct-undeposited',
      defaultSalesTaxPayableAccountId: 'acct-tax',
      defaultTipsPayableAccountId: 'acct-tips',
      defaultServiceChargeRevenueAccountId: 'acct-svc',
      defaultRoundingAccountId: 'acct-rounding',
    });

    // No F&B GL mappings — returns empty
    const { db } = await import('@oppsera/db');
    (db as any).select.mockReturnThis();
    (db as any).from.mockReturnThis();
    (db as any).where.mockResolvedValueOnce([]);

    await handleFnbGlPostingForAccounting(baseEvent as any);

    expect(mockPostEntry).toHaveBeenCalledOnce();
    const call = mockPostEntry.mock.calls[0]!;
    const [ctx, input] = call;

    expect(ctx.tenantId).toBe('tenant-1');
    expect(ctx.requestId).toBe('fnb-gl-batch-1');
    expect(input.sourceModule).toBe('fnb');
    expect(input.sourceReferenceId).toBe('batch-1');
    expect(input.forcePost).toBe(true);

    // Verify lines — cash_on_hand uses undeposited as fallback, undeposited_funds uses settings
    const lines = input.lines as any[];
    expect(lines.length).toBeGreaterThanOrEqual(4);

    // All lines should have channel = 'fnb'
    for (const line of lines) {
      expect(line.channel).toBe('fnb');
      expect(line.locationId).toBe('loc-1');
    }
  });

  it('should use F&B GL mappings when available', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultUndepositedFundsAccountId: 'acct-undeposited',
      defaultSalesTaxPayableAccountId: 'acct-tax',
      defaultTipsPayableAccountId: 'acct-tips',
      defaultServiceChargeRevenueAccountId: 'acct-svc',
    });

    const { db } = await import('@oppsera/db');
    (db as any).select.mockReturnThis();
    (db as any).from.mockReturnThis();
    (db as any).where.mockResolvedValueOnce([
      {
        entityType: 'department',
        entityId: 'default',
        revenueAccountId: 'acct-fnb-revenue',
        expenseAccountId: null,
        liabilityAccountId: null,
        assetAccountId: null,
        contraRevenueAccountId: null,
      },
      {
        entityType: 'payment_type',
        entityId: 'default',
        revenueAccountId: null,
        expenseAccountId: null,
        liabilityAccountId: null,
        assetAccountId: 'acct-cash-drawer',
        contraRevenueAccountId: null,
      },
    ]);

    await handleFnbGlPostingForAccounting(baseEvent as any);

    expect(mockPostEntry).toHaveBeenCalledOnce();
    const lines = mockPostEntry.mock.calls[0]![1].lines as any[];

    // cash_on_hand should use payment_type mapping's assetAccountId
    const cashLine = lines.find((l: any) => l.debitAmount === '80.00');
    expect(cashLine?.accountId).toBe('acct-cash-drawer');

    // sales_revenue should use department mapping's revenueAccountId
    const revenueLine = lines.find((l: any) => l.creditAmount === '120.00');
    expect(revenueLine?.accountId).toBe('acct-fnb-revenue');
  });

  it('should log unmapped events for missing account mappings', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      // NO defaults at all
    });

    const { db } = await import('@oppsera/db');
    (db as any).select.mockReturnThis();
    (db as any).from.mockReturnThis();
    (db as any).where.mockResolvedValueOnce([]);

    const { logUnmappedEvent } = await import('../helpers/resolve-mapping');

    const event = {
      ...baseEvent,
      data: {
        ...baseEvent.data,
        journalLines: [
          { category: 'sales_revenue', description: 'Net sales', debitCents: 0, creditCents: 10000 },
          { category: 'cash_on_hand', description: 'Cash', debitCents: 10000, creditCents: 0 },
        ],
      },
    };

    await handleFnbGlPostingForAccounting(event as any);

    // Both categories unmapped — should log unmapped events
    expect(logUnmappedEvent).toHaveBeenCalled();
    // Should NOT post (less than 2 resolved lines)
    expect(mockPostEntry).not.toHaveBeenCalled();
  });

  it('should handle discount and comp lines', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultUndepositedFundsAccountId: 'acct-undeposited',
      defaultSalesTaxPayableAccountId: 'acct-tax',
    });

    const { db } = await import('@oppsera/db');
    (db as any).select.mockReturnThis();
    (db as any).from.mockReturnThis();
    (db as any).where.mockResolvedValueOnce([
      {
        entityType: 'discount',
        entityId: 'default',
        revenueAccountId: null,
        expenseAccountId: null,
        liabilityAccountId: null,
        assetAccountId: null,
        contraRevenueAccountId: 'acct-disc-contra',
      },
      {
        entityType: 'comp',
        entityId: 'default',
        revenueAccountId: null,
        expenseAccountId: 'acct-comp-exp',
        liabilityAccountId: null,
        assetAccountId: null,
        contraRevenueAccountId: null,
      },
      {
        entityType: 'department',
        entityId: 'default',
        revenueAccountId: 'acct-revenue',
        expenseAccountId: null,
        liabilityAccountId: null,
        assetAccountId: null,
        contraRevenueAccountId: null,
      },
    ]);

    const event = {
      ...baseEvent,
      data: {
        ...baseEvent.data,
        journalLines: [
          { category: 'undeposited_funds', description: 'Payments', debitCents: 8000, creditCents: 0 },
          { category: 'discount', description: 'Discounts', debitCents: 500, creditCents: 0 },
          { category: 'comp_expense', description: 'Comps', debitCents: 300, creditCents: 0 },
          { category: 'sales_revenue', description: 'Revenue', debitCents: 0, creditCents: 8000 },
          { category: 'tax_payable', description: 'Tax', debitCents: 0, creditCents: 800 },
        ],
      },
    };

    await handleFnbGlPostingForAccounting(event as any);

    expect(mockPostEntry).toHaveBeenCalledOnce();
    const lines = mockPostEntry.mock.calls[0]![1].lines as any[];

    const discountLine = lines.find((l: any) => l.debitAmount === '5.00');
    expect(discountLine?.accountId).toBe('acct-disc-contra');

    const compLine = lines.find((l: any) => l.debitAmount === '3.00');
    expect(compLine?.accountId).toBe('acct-comp-exp');
  });

  it('should handle cash over/short (shortage = debit, overage = credit)', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultUndepositedFundsAccountId: 'acct-undeposited',
      defaultRoundingAccountId: 'acct-rounding',
    });

    const { db } = await import('@oppsera/db');
    (db as any).select.mockReturnThis();
    (db as any).from.mockReturnThis();
    (db as any).where.mockResolvedValueOnce([
      {
        entityType: 'department',
        entityId: 'default',
        revenueAccountId: 'acct-revenue',
        expenseAccountId: null,
        liabilityAccountId: null,
        assetAccountId: null,
        contraRevenueAccountId: null,
      },
    ]);

    const event = {
      ...baseEvent,
      data: {
        ...baseEvent.data,
        journalLines: [
          { category: 'undeposited_funds', description: 'Payments', debitCents: 10000, creditCents: 0 },
          { category: 'cash_over_short', description: 'Cash shortage', debitCents: 200, creditCents: 0 },
          { category: 'sales_revenue', description: 'Revenue', debitCents: 0, creditCents: 10200 },
        ],
      },
    };

    await handleFnbGlPostingForAccounting(event as any);

    expect(mockPostEntry).toHaveBeenCalledOnce();
    const lines = mockPostEntry.mock.calls[0]![1].lines as any[];

    const overShortLine = lines.find((l: any) => l.debitAmount === '2.00');
    expect(overShortLine?.accountId).toBe('acct-rounding');
  });

  it('should never throw — catches all errors', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockRejectedValueOnce(new Error('DB down'));

    // Should NOT throw
    await expect(handleFnbGlPostingForAccounting(baseEvent as any)).resolves.toBeUndefined();
  });

  it('should convert cents to dollars correctly', async () => {
    const { getAccountingSettings } = await import('../helpers/get-accounting-settings');
    (getAccountingSettings as any).mockResolvedValueOnce({
      defaultUndepositedFundsAccountId: 'acct-undeposited',
      defaultSalesTaxPayableAccountId: 'acct-tax',
    });

    const { db } = await import('@oppsera/db');
    (db as any).select.mockReturnThis();
    (db as any).from.mockReturnThis();
    (db as any).where.mockResolvedValueOnce([
      {
        entityType: 'department',
        entityId: 'default',
        revenueAccountId: 'acct-revenue',
        expenseAccountId: null,
        liabilityAccountId: null,
        assetAccountId: null,
        contraRevenueAccountId: null,
      },
    ]);

    const event = {
      ...baseEvent,
      data: {
        ...baseEvent.data,
        journalLines: [
          { category: 'undeposited_funds', description: 'Payments', debitCents: 12345, creditCents: 0 },
          { category: 'sales_revenue', description: 'Revenue', debitCents: 0, creditCents: 11545 },
          { category: 'tax_payable', description: 'Tax', debitCents: 0, creditCents: 800 },
        ],
      },
    };

    await handleFnbGlPostingForAccounting(event as any);

    expect(mockPostEntry).toHaveBeenCalledOnce();
    const lines = mockPostEntry.mock.calls[0]![1].lines as any[];

    // $123.45 debit
    const debitLine = lines.find((l: any) => l.debitAmount === '123.45');
    expect(debitLine).toBeDefined();

    // $115.45 credit
    const revLine = lines.find((l: any) => l.creditAmount === '115.45');
    expect(revLine).toBeDefined();

    // $8.00 tax credit
    const taxLine = lines.find((l: any) => l.creditAmount === '8.00');
    expect(taxLine).toBeDefined();
  });
});
