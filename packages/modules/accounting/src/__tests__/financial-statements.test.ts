import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// Mock external dependencies
vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn(),
  sql: vi.fn((...args: any[]) => args),
  financialStatementLayouts: {
    tenantId: 'tenant_id',
    statementType: 'statement_type',
    id: 'id',
    name: 'name',
    isDefault: 'is_default',
  },
  glAccounts: { id: 'id', tenantId: 'tenant_id' },
  glJournalEntries: {
    id: 'id',
    tenantId: 'tenant_id',
    sourceModule: 'source_module',
    sourceReferenceId: 'source_reference_id',
    status: 'status',
    postingPeriod: 'posting_period',
  },
  glJournalLines: {
    id: 'id',
    journalEntryId: 'journal_entry_id',
    accountId: 'account_id',
    debitAmount: 'debit_amount',
    creditAmount: 'credit_amount',
  },
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn(async (_ctx: any, fn: any) => {
    const mockTx = createMockTx();
    const { result } = await fn(mockTx);
    return result;
  }),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx, eventType, data) => ({
    eventId: 'evt-1',
    eventType,
    data,
    tenantId: 'tenant-1',
    occurredAt: new Date().toISOString(),
  })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn(),
}));

vi.mock('../helpers/generate-journal-number', () => ({
  generateJournalNumber: vi.fn().mockResolvedValue(1001),
}));

vi.mock('../events/types', () => ({
  ACCOUNTING_EVENTS: {
    JOURNAL_POSTED: 'accounting.journal.posted.v1',
    JOURNAL_DRAFTED: 'accounting.journal.drafted.v1',
    JOURNAL_VOIDED: 'accounting.journal.voided.v1',
    PERIOD_LOCKED: 'accounting.period.locked.v1',
    POSTING_SKIPPED: 'accounting.posting.skipped.v1',
    PERIOD_CLOSED: 'accounting.period.closed.v1',
  },
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => `ulid-${Math.random().toString(36).slice(2, 8)}`),
  NotFoundError: class extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(e: string, id?: string) {
      super(`${e} ${id ?? ''} not found`);
    }
  },
  AppError: class extends Error {
    code: string;
    statusCode: number;
    constructor(c: string, m: string, s = 400) {
      super(m);
      this.code = c;
      this.statusCode = s;
    }
  },
}));

function createMockTx() {
  const tx: Record<string, any> = {};
  tx.select = vi.fn().mockReturnValue(tx);
  tx.from = vi.fn().mockReturnValue(tx);
  tx.where = vi.fn().mockReturnValue(tx);
  tx.limit = vi.fn().mockResolvedValue([]);
  tx.insert = vi.fn().mockReturnValue(tx);
  tx.values = vi.fn().mockReturnValue(tx);
  tx.returning = vi.fn().mockResolvedValue([]);
  tx.update = vi.fn().mockReturnValue(tx);
  tx.set = vi.fn().mockReturnValue(tx);
  tx.execute = vi.fn().mockResolvedValue([]);
  tx.orderBy = vi.fn().mockReturnValue(tx);
  return tx;
}

function createCtx(overrides?: Record<string, unknown>): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: {
      id: 'user-1',
      email: 'test@test.com',
      name: 'Test User',
      tenantId: 'tenant-1',
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    requestId: 'req-1',
    isPlatformAdmin: false,
    ...overrides,
  } as unknown as RequestContext;
}

// ── P&L Tests ────────────────────────────────────────────────────

describe('getProfitAndLoss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should compute netIncome = totalRevenue - totalExpenses', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            account_id: 'rev-1',
            account_number: '4000',
            account_name: 'Sales Revenue',
            account_type: 'revenue',
            classification_name: 'Revenue',
            amount: '5000.00',
          },
          {
            account_id: 'exp-1',
            account_number: '6000',
            account_name: 'Rent Expense',
            account_type: 'expense',
            classification_name: 'Operating Expenses',
            amount: '2000.00',
          },
        ]),
      };
      return fn(mockTx);
    });

    const { getProfitAndLoss } = await import('../queries/get-profit-and-loss');
    const result = await getProfitAndLoss({
      tenantId: 'tenant-1',
      from: '2026-01-01',
      to: '2026-01-31',
    });

    expect(result.totalRevenue).toBe(5000);
    expect(result.totalExpenses).toBe(2000);
    expect(result.netIncome).toBe(3000);
  });

  it('should pass locationId for filtering', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            account_id: 'rev-1',
            account_number: '4000',
            account_name: 'Sales Revenue',
            account_type: 'revenue',
            classification_name: 'Revenue',
            amount: '1000.00',
          },
        ]),
      };
      return fn(mockTx);
    });

    const { getProfitAndLoss } = await import('../queries/get-profit-and-loss');
    const result = await getProfitAndLoss({
      tenantId: 'tenant-1',
      from: '2026-01-01',
      to: '2026-01-31',
      locationId: 'loc-1',
    });

    expect(result.locationId).toBe('loc-1');
    expect(result.totalRevenue).toBe(1000);
  });

  it('should include comparative period data when provided', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi
          .fn()
          // Current period
          .mockResolvedValueOnce([
            {
              account_id: 'rev-1',
              account_number: '4000',
              account_name: 'Sales Revenue',
              account_type: 'revenue',
              classification_name: 'Revenue',
              amount: '8000.00',
            },
            {
              account_id: 'exp-1',
              account_number: '6000',
              account_name: 'Rent Expense',
              account_type: 'expense',
              classification_name: 'Operating Expenses',
              amount: '3000.00',
            },
          ])
          // Comparative period
          .mockResolvedValueOnce([
            {
              account_id: 'rev-1',
              account_number: '4000',
              account_name: 'Sales Revenue',
              account_type: 'revenue',
              classification_name: 'Revenue',
              amount: '6000.00',
            },
            {
              account_id: 'exp-1',
              account_number: '6000',
              account_name: 'Rent Expense',
              account_type: 'expense',
              classification_name: 'Operating Expenses',
              amount: '2500.00',
            },
          ]),
      };
      return fn(mockTx);
    });

    const { getProfitAndLoss } = await import('../queries/get-profit-and-loss');
    const result = await getProfitAndLoss({
      tenantId: 'tenant-1',
      from: '2026-02-01',
      to: '2026-02-28',
      comparativeFrom: '2026-01-01',
      comparativeTo: '2026-01-31',
    });

    expect(result.netIncome).toBe(5000);
    expect(result.comparativeNetIncome).toBe(3500);
    expect(result.comparativePeriod).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(result.comparativeSections).toBeDefined();
    expect(result.comparativeSections!.length).toBeGreaterThan(0);
  });

  it('should group accounts by classification into sections', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            account_id: 'rev-1',
            account_number: '4000',
            account_name: 'Product Revenue',
            account_type: 'revenue',
            classification_name: 'Sales',
            amount: '3000.00',
          },
          {
            account_id: 'rev-2',
            account_number: '4100',
            account_name: 'Service Revenue',
            account_type: 'revenue',
            classification_name: 'Sales',
            amount: '2000.00',
          },
          {
            account_id: 'exp-1',
            account_number: '6000',
            account_name: 'Rent',
            account_type: 'expense',
            classification_name: 'Operating',
            amount: '1500.00',
          },
        ]),
      };
      return fn(mockTx);
    });

    const { getProfitAndLoss } = await import('../queries/get-profit-and-loss');
    const result = await getProfitAndLoss({
      tenantId: 'tenant-1',
      from: '2026-01-01',
      to: '2026-01-31',
    });

    // Sales section should have 2 accounts
    const salesSection = result.sections.find((s) => s.label === 'Sales');
    expect(salesSection).toBeDefined();
    expect(salesSection!.accounts).toHaveLength(2);
    expect(salesSection!.subtotal).toBe(5000);

    // Operating section should have 1 account
    const opSection = result.sections.find((s) => s.label === 'Operating');
    expect(opSection).toBeDefined();
    expect(opSection!.accounts).toHaveLength(1);
    expect(opSection!.subtotal).toBe(1500);
  });
});

// ── Balance Sheet Tests ──────────────────────────────────────────

describe('getBalanceSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return isBalanced=true when A = L + E', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi
          .fn()
          // Balance sheet account balances
          .mockResolvedValueOnce([
            {
              account_id: 'asset-1',
              account_number: '1010',
              account_name: 'Cash',
              account_type: 'asset',
              normal_balance: 'debit',
              classification_name: 'Current Assets',
              balance: '10000.00',
            },
            {
              account_id: 'liab-1',
              account_number: '2010',
              account_name: 'Accounts Payable',
              account_type: 'liability',
              normal_balance: 'credit',
              classification_name: 'Current Liabilities',
              balance: '3000.00',
            },
            {
              account_id: 'eq-1',
              account_number: '3010',
              account_name: 'Retained Earnings',
              account_type: 'equity',
              normal_balance: 'credit',
              classification_name: 'Equity',
              balance: '5000.00',
            },
          ])
          // Settings (fiscal year start month)
          .mockResolvedValueOnce([{ fiscal_year_start_month: 1 }])
          // Net income query (revenue - expenses = 2000 to balance the sheet)
          .mockResolvedValueOnce([{ total_revenue: '4000.00', total_expenses: '2000.00' }]),
      };
      return fn(mockTx);
    });

    const { getBalanceSheet } = await import('../queries/get-balance-sheet');
    const result = await getBalanceSheet({
      tenantId: 'tenant-1',
      asOfDate: '2026-01-31',
    });

    expect(result.totalAssets).toBe(10000);
    expect(result.totalLiabilities).toBe(3000);
    expect(result.currentYearNetIncome).toBe(2000);
    // totalEquity = 5000 (RE) + 2000 (net income) = 7000
    expect(result.totalEquity).toBe(7000);
    // A (10000) = L (3000) + E (7000)
    expect(result.isBalanced).toBe(true);
  });

  it('should include current year net income in totalEquity', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi
          .fn()
          .mockResolvedValueOnce([
            {
              account_id: 'eq-1',
              account_number: '3010',
              account_name: 'Retained Earnings',
              account_type: 'equity',
              normal_balance: 'credit',
              classification_name: 'Equity',
              balance: '1000.00',
            },
          ])
          .mockResolvedValueOnce([{ fiscal_year_start_month: 1 }])
          .mockResolvedValueOnce([{ total_revenue: '5000.00', total_expenses: '2000.00' }]),
      };
      return fn(mockTx);
    });

    const { getBalanceSheet } = await import('../queries/get-balance-sheet');
    const result = await getBalanceSheet({
      tenantId: 'tenant-1',
      asOfDate: '2026-06-30',
    });

    expect(result.currentYearNetIncome).toBe(3000);
    // totalEquity = 1000 (balance sheet equity accounts) + 3000 (current year net income)
    expect(result.totalEquity).toBe(4000);
  });

  it('should flag isBalanced=false when unbalanced', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi
          .fn()
          .mockResolvedValueOnce([
            {
              account_id: 'asset-1',
              account_number: '1010',
              account_name: 'Cash',
              account_type: 'asset',
              normal_balance: 'debit',
              classification_name: 'Current Assets',
              balance: '10000.00',
            },
            {
              account_id: 'liab-1',
              account_number: '2010',
              account_name: 'AP',
              account_type: 'liability',
              normal_balance: 'credit',
              classification_name: 'Current Liabilities',
              balance: '2000.00',
            },
          ])
          .mockResolvedValueOnce([{ fiscal_year_start_month: 1 }])
          // Net income = 0, so equity = 0 (no equity accounts with balance)
          .mockResolvedValueOnce([{ total_revenue: '0', total_expenses: '0' }]),
      };
      return fn(mockTx);
    });

    const { getBalanceSheet } = await import('../queries/get-balance-sheet');
    const result = await getBalanceSheet({
      tenantId: 'tenant-1',
      asOfDate: '2026-01-31',
    });

    // A = 10000, L = 2000, E = 0. 10000 != 2000 + 0
    expect(result.isBalanced).toBe(false);
  });
});

// ── Sales Tax Liability Tests ────────────────────────────────────

describe('getSalesTaxLiability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should compute netLiability = collected - remitted', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            tax_group_id: 'tg-1',
            tax_payable_account_id: 'acct-tax-1',
            account_name: 'State Sales Tax Payable',
            total_credits: '1500.00', // collected
            total_debits: '300.00', // remitted
          },
        ]),
      };
      return fn(mockTx);
    });

    const { getSalesTaxLiability } = await import('../queries/get-sales-tax-liability');
    const result = await getSalesTaxLiability({
      tenantId: 'tenant-1',
      from: '2026-01-01',
      to: '2026-01-31',
    });

    expect(result.taxGroups).toHaveLength(1);
    expect(result.taxGroups[0]!.taxCollected).toBe(1500);
    expect(result.taxGroups[0]!.taxRemitted).toBe(300);
    expect(result.taxGroups[0]!.netLiability).toBe(1200);
    expect(result.totalNetLiability).toBe(1200);
  });

  it('should group by tax group correctly', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            tax_group_id: 'tg-state',
            tax_payable_account_id: 'acct-state-tax',
            account_name: 'State Tax Payable',
            total_credits: '1000.00',
            total_debits: '200.00',
          },
          {
            tax_group_id: 'tg-county',
            tax_payable_account_id: 'acct-county-tax',
            account_name: 'County Tax Payable',
            total_credits: '500.00',
            total_debits: '100.00',
          },
        ]),
      };
      return fn(mockTx);
    });

    const { getSalesTaxLiability } = await import('../queries/get-sales-tax-liability');
    const result = await getSalesTaxLiability({
      tenantId: 'tenant-1',
      from: '2026-01-01',
      to: '2026-01-31',
    });

    expect(result.taxGroups).toHaveLength(2);
    expect(result.taxGroups[0]!.taxGroupId).toBe('tg-state');
    expect(result.taxGroups[0]!.netLiability).toBe(800);
    expect(result.taxGroups[1]!.taxGroupId).toBe('tg-county');
    expect(result.taxGroups[1]!.netLiability).toBe(400);
    expect(result.totalCollected).toBe(1500);
    expect(result.totalRemitted).toBe(300);
    expect(result.totalNetLiability).toBe(1200);
  });
});

// ── Cash Flow Tests ──────────────────────────────────────────────

describe('getCashFlowSimplified', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should compute netOperatingCashFlow = netIncome + changeAP - changeAR', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi
          .fn()
          // Net income query
          .mockResolvedValueOnce([{ revenue: '10000.00', expenses: '6000.00' }])
          // Settings (AP/AR account IDs)
          .mockResolvedValueOnce([
            { default_ap_control_account_id: 'acct-ap', default_ar_control_account_id: 'acct-ar' },
          ])
          // Change in AP (credits - debits = positive means AP increased)
          .mockResolvedValueOnce([{ change: '500.00' }])
          // Change in AR (credits - debits = negative means AR increased)
          .mockResolvedValueOnce([{ change: '-800.00' }]),
      };
      return fn(mockTx);
    });

    const { getCashFlowSimplified } = await import('../queries/get-cash-flow-simplified');
    const result = await getCashFlowSimplified({
      tenantId: 'tenant-1',
      from: '2026-01-01',
      to: '2026-01-31',
    });

    // Net income = 10000 - 6000 = 4000
    expect(result.operating.netIncome).toBe(4000);
    // Change in AP = 500 (AP increased — positive for cash)
    expect(result.operating.changeInAP).toBe(500);
    // Change in AR = -800 (AR increased — negative for cash from the formula's perspective)
    // netOperatingCashFlow = 4000 + 500 - (-800) = 5300
    expect(result.operating.changeInAR).toBe(-800);
    expect(result.operating.netOperatingCashFlow).toBe(5300);
    expect(result.netCashChange).toBe(5300);
  });
});

// ── Period Comparison Tests ──────────────────────────────────────

describe('getPeriodComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should compute variance correctly', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            account_id: 'rev-1',
            account_number: '4000',
            account_name: 'Sales Revenue',
            account_type: 'revenue',
            normal_balance: 'credit',
            current_amount: '12000.00',
            prior_amount: '10000.00',
          },
          {
            account_id: 'exp-1',
            account_number: '6000',
            account_name: 'Rent Expense',
            account_type: 'expense',
            normal_balance: 'debit',
            current_amount: '3000.00',
            prior_amount: '2500.00',
          },
        ]),
      };
      return fn(mockTx);
    });

    const { getPeriodComparison } = await import('../queries/get-period-comparison');
    const result = await getPeriodComparison({
      tenantId: 'tenant-1',
      currentFrom: '2026-02-01',
      currentTo: '2026-02-28',
      priorFrom: '2026-01-01',
      priorTo: '2026-01-31',
    });

    expect(result.lines).toHaveLength(2);
    // Revenue: 12000 - 10000 = 2000 variance, 20% increase
    expect(result.lines[0]!.varianceDollar).toBe(2000);
    expect(result.lines[0]!.variancePercent).toBe(20);
    // Expense: 3000 - 2500 = 500 variance, 20% increase
    expect(result.lines[1]!.varianceDollar).toBe(500);
    expect(result.lines[1]!.variancePercent).toBe(20);
  });

  it('should return null variancePercent when prior is zero', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            account_id: 'rev-1',
            account_number: '4000',
            account_name: 'New Revenue',
            account_type: 'revenue',
            normal_balance: 'credit',
            current_amount: '5000.00',
            prior_amount: '0',
          },
        ]),
      };
      return fn(mockTx);
    });

    const { getPeriodComparison } = await import('../queries/get-period-comparison');
    const result = await getPeriodComparison({
      tenantId: 'tenant-1',
      currentFrom: '2026-02-01',
      currentTo: '2026-02-28',
      priorFrom: '2026-01-01',
      priorTo: '2026-01-31',
    });

    expect(result.lines[0]!.currentAmount).toBe(5000);
    expect(result.lines[0]!.priorAmount).toBe(0);
    expect(result.lines[0]!.varianceDollar).toBe(5000);
    expect(result.lines[0]!.variancePercent).toBeNull();
  });
});

// ── Financial Health Summary Tests ───────────────────────────────

describe('getFinancialHealthSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all KPI fields with correct values', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi
          .fn()
          // 1. Settings
          .mockResolvedValueOnce([
            {
              fiscal_year_start_month: 1,
              default_ap_control_account_id: 'acct-ap',
              default_ar_control_account_id: 'acct-ar',
              default_undeposited_funds_account_id: 'acct-udf',
            },
          ])
          // 2. Net income (month + YTD)
          .mockResolvedValueOnce([{ month_net_income: '3500.00', ytd_net_income: '12000.00' }])
          // 3. Cash balance (bank accounts)
          .mockResolvedValueOnce([{ balance: '25000.00' }])
          // 4. Trial balance check
          .mockResolvedValueOnce([{ total_debits: '50000.00', total_credits: '50000.00' }])
          // 5. Unmapped events count
          .mockResolvedValueOnce([{ count: 3 }])
          // 6. AP balance (getAccountBalance in return)
          .mockResolvedValueOnce([{ balance: '4500.00' }])
          // 7. AR balance (getAccountBalance in return)
          .mockResolvedValueOnce([{ balance: '2000.00' }])
          // 8. Undeposited funds (getAccountBalance in return)
          .mockResolvedValueOnce([{ balance: '750.00' }]),
      };
      return fn(mockTx);
    });

    const { getFinancialHealthSummary } = await import('../queries/get-financial-health-summary');
    const result = await getFinancialHealthSummary({
      tenantId: 'tenant-1',
      asOfDate: '2026-02-15',
    });

    expect(result.netIncomeCurrentMonth).toBe(3500);
    expect(result.netIncomeYTD).toBe(12000);
    expect(result.apBalance).toBe(4500);
    expect(result.arBalance).toBe(2000);
    expect(result.cashBalance).toBe(25000);
    expect(result.trialBalanceStatus).toBe('balanced');
    expect(result.unmappedEventsCount).toBe(3);
    expect(result.undepositedFunds).toBe(750);
  });

  it('should return unbalanced trial balance status', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi
          .fn()
          // Settings
          .mockResolvedValueOnce([
            {
              fiscal_year_start_month: 1,
              default_ap_control_account_id: null,
              default_ar_control_account_id: null,
              default_undeposited_funds_account_id: null,
            },
          ])
          // Net income
          .mockResolvedValueOnce([{ month_net_income: '0', ytd_net_income: '0' }])
          // Cash balance
          .mockResolvedValueOnce([{ balance: '0' }])
          // Trial balance check (unbalanced)
          .mockResolvedValueOnce([{ total_debits: '10000.00', total_credits: '9500.00' }])
          // Unmapped events
          .mockResolvedValueOnce([{ count: 0 }]),
      };
      return fn(mockTx);
    });

    const { getFinancialHealthSummary } = await import('../queries/get-financial-health-summary');
    const result = await getFinancialHealthSummary({
      tenantId: 'tenant-1',
      asOfDate: '2026-02-15',
    });

    expect(result.trialBalanceStatus).toBe('unbalanced');
  });
});

// ── Retained Earnings Tests ──────────────────────────────────────

describe('generateRetainedEarnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a balanced closing journal entry', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      // Settings
      (mockTx.execute as any).mockResolvedValueOnce([
        { fiscal_year_start_month: 1, default_rounding_account_id: null },
      ]);
      // No existing entry (idempotency)
      (mockTx.execute as any).mockResolvedValueOnce([]);
      // Net income computation
      (mockTx.execute as any).mockResolvedValueOnce([
        { total_revenue: '15000.00', total_expenses: '9000.00' },
      ]);
      // RE account exists
      (mockTx.limit as any).mockResolvedValueOnce([{ id: 'acct-re' }]);
      // Account detail for closing lines
      (mockTx.execute as any).mockResolvedValueOnce([
        { account_id: 'rev-1', account_type: 'revenue', total_debits: '0', total_credits: '15000.00' },
        { account_id: 'exp-1', account_type: 'expense', total_debits: '9000.00', total_credits: '0' },
      ]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const { generateRetainedEarnings } = await import('../commands/generate-retained-earnings');
    const result = await generateRetainedEarnings(ctx, {
      fiscalYearEnd: '2026-12-31',
      retainedEarningsAccountId: 'acct-re',
    });

    expect(result.netIncome).toBe(6000);
    expect(result.totalRevenue).toBe(15000);
    expect(result.totalExpenses).toBe(9000);
    // Lines: debit revenue, credit expense, credit RE = 3 lines
    expect(result.lineCount).toBe(3);
  });

  it('should reject duplicate closing entry (idempotency)', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      // Settings
      (mockTx.execute as any).mockResolvedValueOnce([
        { fiscal_year_start_month: 1, default_rounding_account_id: null },
      ]);
      // Existing entry found (duplicate)
      (mockTx.execute as any).mockResolvedValueOnce([{ id: 'existing-je' }]);

      return fn(mockTx);
    });

    const ctx = createCtx();
    const { generateRetainedEarnings } = await import('../commands/generate-retained-earnings');

    await expect(
      generateRetainedEarnings(ctx, {
        fiscalYearEnd: '2026-12-31',
        retainedEarningsAccountId: 'acct-re',
      }),
    ).rejects.toThrow('already exists');
  });

  it('should reject when net income is zero', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      // Settings
      (mockTx.execute as any).mockResolvedValueOnce([
        { fiscal_year_start_month: 1, default_rounding_account_id: null },
      ]);
      // No existing entry
      (mockTx.execute as any).mockResolvedValueOnce([]);
      // Net income = 0
      (mockTx.execute as any).mockResolvedValueOnce([
        { total_revenue: '0', total_expenses: '0' },
      ]);

      return fn(mockTx);
    });

    const ctx = createCtx();
    const { generateRetainedEarnings } = await import('../commands/generate-retained-earnings');

    await expect(
      generateRetainedEarnings(ctx, {
        fiscalYearEnd: '2026-12-31',
        retainedEarningsAccountId: 'acct-re',
      }),
    ).rejects.toThrow('zero');
  });
});

// ── Statement Layout Tests ───────────────────────────────────────

describe('saveStatementLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create new layout when no id provided', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.returning as any).mockResolvedValueOnce([
        {
          id: 'layout-1',
          tenantId: 'tenant-1',
          statementType: 'profit_loss',
          name: 'My P&L',
          sections: [{ label: 'Revenue', classificationIds: ['cls-1'] }],
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const { saveStatementLayout } = await import('../commands/save-statement-layout');
    const result = await saveStatementLayout(ctx, {
      statementType: 'profit_loss',
      name: 'My P&L',
      sections: [{ label: 'Revenue', classificationIds: ['cls-1'], accountIds: [] }],
    });

    expect(result.id).toBe('layout-1');
    expect(result.statementType).toBe('profit_loss');
  });

  it('should update existing layout when id provided', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.returning as any).mockResolvedValueOnce([
        {
          id: 'layout-1',
          tenantId: 'tenant-1',
          statementType: 'profit_loss',
          name: 'Updated P&L',
          sections: [{ label: 'Revenue Updated', classificationIds: ['cls-1'] }],
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const { saveStatementLayout } = await import('../commands/save-statement-layout');
    const result = await saveStatementLayout(ctx, {
      id: 'layout-1',
      statementType: 'profit_loss',
      name: 'Updated P&L',
      sections: [{ label: 'Revenue Updated', classificationIds: ['cls-1'], accountIds: [] }],
    });

    expect(result.id).toBe('layout-1');
    expect(result.name).toBe('Updated P&L');
  });

  it('should clear other defaults when setting isDefault=true', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.returning as any).mockResolvedValueOnce([
        {
          id: 'layout-2',
          tenantId: 'tenant-1',
          statementType: 'balance_sheet',
          name: 'Default BS',
          sections: [{ label: 'Assets', classificationIds: [] }],
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const { result } = await fn(mockTx);

      // update() called once to clear existing defaults before insert
      expect(mockTx.update).toHaveBeenCalled();
      return result;
    });

    const ctx = createCtx();
    const { saveStatementLayout } = await import('../commands/save-statement-layout');
    const result = await saveStatementLayout(ctx, {
      statementType: 'balance_sheet',
      name: 'Default BS',
      sections: [{ label: 'Assets', classificationIds: [], accountIds: [] }],
      isDefault: true,
    });

    expect(result.isDefault).toBe(true);
  });
});

describe('listStatementLayouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should filter by statementType', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 'layout-1',
            statementType: 'profit_loss',
            name: 'Standard P&L',
            sections: [{ label: 'Revenue' }],
            isDefault: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      };
      return fn(mockTx);
    });

    const { listStatementLayouts } = await import('../queries/list-statement-layouts');
    const result = await listStatementLayouts({
      tenantId: 'tenant-1',
      statementType: 'profit_loss',
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.statementType).toBe('profit_loss');
    expect(result[0]!.isDefault).toBe(true);
  });

  it('should return all layouts when no type filter', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 'layout-1',
            statementType: 'profit_loss',
            name: 'P&L',
            sections: [],
            isDefault: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'layout-2',
            statementType: 'balance_sheet',
            name: 'BS',
            sections: [],
            isDefault: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      };
      return fn(mockTx);
    });

    const { listStatementLayouts } = await import('../queries/list-statement-layouts');
    const result = await listStatementLayouts({ tenantId: 'tenant-1' });

    expect(result).toHaveLength(2);
    expect(result[0]!.statementType).toBe('profit_loss');
    expect(result[1]!.statementType).toBe('balance_sheet');
  });
});
