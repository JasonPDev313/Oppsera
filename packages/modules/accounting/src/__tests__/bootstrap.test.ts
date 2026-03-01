import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bootstrapTenantCoa } from '../helpers/bootstrap-tenant-coa';
import { resolveNormalBalance } from '../helpers/resolve-normal-balance';

vi.mock('@oppsera/db', () => ({
  glAccounts: { tenantId: 'tenantId', id: 'id' },
  glClassifications: { tenantId: 'tenantId', id: 'id' },
  glAccountTemplates: { templateKey: 'templateKey' },
  glClassificationTemplates: { templateKey: 'templateKey' },
  accountingSettings: { tenantId: 'tenantId' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => ({ type: 'eq' })),
  sql: Object.assign(
    function sql(strings: TemplateStringsArray, ...values: unknown[]) {
      return { strings, values, __isSql: true };
    },
    {
      raw: (s: string) => s,
      join: (parts: unknown[], separator?: unknown) => ({ __isSqlJoin: true, parts, separator }),
    },
  ),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => `ulid-${Math.random().toString(36).slice(2, 8)}`),
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('../services/state-placeholder', () => ({
  applyStatePlaceholders: vi.fn((templates: any[]) => templates),
}));

describe('bootstrapTenantCoa', () => {
  const classificationTemplates = [
    { id: 'ct-1', templateKey: 'shared', name: 'Cash & Bank', accountType: 'asset', sortOrder: 10 },
    { id: 'ct-2', templateKey: 'shared', name: 'Payables', accountType: 'liability', sortOrder: 20 },
  ];

  const accountTemplates = [
    { id: 'at-1', templateKey: 'golf_default', accountNumber: '1010', name: 'Cash on Hand', accountType: 'asset', normalBalance: 'debit', classificationName: 'Cash & Bank', isControlAccount: false, controlAccountType: null, sortOrder: 10 },
    { id: 'at-2', templateKey: 'golf_default', accountNumber: '2000', name: 'Accounts Payable', accountType: 'liability', normalBalance: 'credit', classificationName: 'Payables', isControlAccount: true, controlAccountType: 'ap', sortOrder: 200 },
    { id: 'at-5', templateKey: 'golf_default', accountNumber: '2160', name: 'Tips Payable', accountType: 'liability', normalBalance: 'credit', classificationName: 'Accrued Liabilities', isControlAccount: false, controlAccountType: null, sortOrder: 225 },
    { id: 'at-3', templateKey: 'golf_default', accountNumber: '3000', name: 'Retained Earnings', accountType: 'equity', normalBalance: 'credit', classificationName: 'Retained Earnings', isControlAccount: false, controlAccountType: null, sortOrder: 300 },
    { id: 'at-6', templateKey: 'golf_default', accountNumber: '4500', name: 'Service Charge Revenue', accountType: 'revenue', normalBalance: 'credit', classificationName: 'Operating Revenue', isControlAccount: false, controlAccountType: null, sortOrder: 495 },
    { id: 'at-4', templateKey: 'golf_default', accountNumber: '9999', name: 'Rounding', accountType: 'expense', normalBalance: 'debit', classificationName: 'System Accounts', isControlAccount: false, controlAccountType: null, sortOrder: 999 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockTx(opts: {
    existingSettings?: boolean;
    classificationTemplates: any[];
    accountTemplates: any[];
    existingAccountCount?: number;
    existingClassificationCount?: number;
  }) {
    let selectCallCount = 0;
    const executeCalls: any[] = [];

    // Build a chainable mock for select().from().where().limit()
    const buildSelectChain = (resolveValue: any) => {
      const chain: any = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.limit = vi.fn(() => Promise.resolve(resolveValue));
      // Also make .where() directly resolvable (for templates that don't chain .limit())
      chain.where.mockImplementation(() => {
        const resultPromise = Promise.resolve(resolveValue) as any;
        resultPromise.limit = vi.fn(() => Promise.resolve(resolveValue));
        resultPromise.from = chain.from;
        resultPromise.where = chain.where;
        return resultPromise;
      });
      return chain;
    };

    const mockTx: any = {
      select: vi.fn(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // First select: idempotency check for accounting_settings
          if (opts.existingSettings) {
            return buildSelectChain([{ tenantId: 'tenant-1' }]);
          }
          return buildSelectChain([]);
        } else if (selectCallCount === 2) {
          if (opts.existingSettings) {
            // Second select when already bootstrapped: count accounts (glAccounts)
            const items = Array.from({ length: opts.existingAccountCount ?? 6 }, (_, i) => ({ id: `a-${i}` }));
            return buildSelectChain(items);
          }
          // Second select: classification templates
          return buildSelectChain(opts.classificationTemplates);
        } else if (selectCallCount === 3) {
          if (opts.existingSettings) {
            // Third select when already bootstrapped: count classifications (glClassifications)
            const items = Array.from({ length: opts.existingClassificationCount ?? 2 }, (_, i) => ({ id: `c-${i}` }));
            return buildSelectChain(items);
          }
          // Third select: account templates
          return buildSelectChain(opts.accountTemplates);
        }
        return buildSelectChain([]);
      }),
      execute: vi.fn((sqlObj: any) => {
        executeCalls.push(sqlObj);
        // Parse the SQL template to figure out what's being inserted
        const templateStr = sqlObj.strings?.join('?') ?? '';

        if (templateStr.includes('gl_classifications')) {
          // Return the id from values (first param after template)
          const id = sqlObj.values?.[0] ?? 'mock-id';
          return Promise.resolve([{ id }]);
        }
        if (templateStr.includes('gl_accounts')) {
          const id = sqlObj.values?.[0] ?? 'mock-id';
          const controlAccountType = sqlObj.values?.[12] ?? null; // controlAccountType position
          return Promise.resolve([{ id, control_account_type: controlAccountType }]);
        }
        if (templateStr.includes('accounting_settings')) {
          return Promise.resolve([]);
        }
        if (templateStr.includes('SAVEPOINT') || templateStr.includes('ROLLBACK TO')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };

    return { mockTx, executeCalls };
  }

  it('should insert classifications and accounts from templates', async () => {
    const { mockTx, executeCalls } = createMockTx({
      classificationTemplates,
      accountTemplates,
    });

    const result = await bootstrapTenantCoa(mockTx, 'tenant-1', 'golf_default');

    expect(result.classificationCount).toBe(2);
    expect(result.accountCount).toBe(6);

    // Should have executed: 1 bulk classification insert + 1 bulk account insert + 1 settings insert = 3
    const insertCalls = executeCalls.filter((c: any) => c.strings?.join('').includes('INSERT'));
    expect(insertCalls.length).toBe(3);
  });

  it('should return early if already bootstrapped', async () => {
    const { mockTx, executeCalls } = createMockTx({
      existingSettings: true,
      classificationTemplates,
      accountTemplates,
      existingAccountCount: 6,
      existingClassificationCount: 2,
    });

    const result = await bootstrapTenantCoa(mockTx, 'tenant-1', 'golf_default');

    expect(result.classificationCount).toBe(2);
    expect(result.accountCount).toBe(6);
    // No execute calls — returned early
    expect(executeCalls.length).toBe(0);
  });

  it('should throw if no templates found for key', async () => {
    const { mockTx } = createMockTx({
      classificationTemplates: [{ id: 'ct-1', name: 'Cash', accountType: 'asset', sortOrder: 10 }],
      accountTemplates: [], // empty
    });

    await expect(bootstrapTenantCoa(mockTx, 'tenant-1', 'nonexistent_key'))
      .rejects.toThrow('No account templates found');
  });

  it('should wire control account IDs to settings', async () => {
    const { mockTx, executeCalls } = createMockTx({
      classificationTemplates,
      accountTemplates,
    });

    await bootstrapTenantCoa(mockTx, 'tenant-1', 'golf_default');

    // Find the settings insert call
    const settingsInsert = executeCalls.find((c: any) =>
      c.strings?.join('').includes('accounting_settings'),
    );
    expect(settingsInsert).toBeDefined();
    // The AP control account ID should be non-null (from account 2000 with controlAccountType 'ap')
    // Values order: tenantId, ap, ar, sales_tax, undeposited, retained_earnings, rounding
    const values = settingsInsert.values;
    expect(values[0]).toBe('tenant-1'); // tenantId
  });
});

describe('resolveNormalBalance', () => {
  it('maps all five account types correctly', () => {
    const expected: Record<string, 'debit' | 'credit'> = {
      asset: 'debit',
      expense: 'debit',
      liability: 'credit',
      equity: 'credit',
      revenue: 'credit',
    };

    for (const [type, balance] of Object.entries(expected)) {
      expect(resolveNormalBalance(type)).toBe(balance);
    }
  });
});
