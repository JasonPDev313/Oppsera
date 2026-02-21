import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bootstrapTenantCoa } from '../helpers/bootstrap-tenant-coa';
import { resolveNormalBalance } from '../helpers/resolve-normal-balance';

vi.mock('@oppsera/db', () => ({
  glAccounts: {},
  glClassifications: {},
  glAccountTemplates: {},
  glClassificationTemplates: {},
  accountingSettings: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => ({ type: 'eq' })),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => `ulid-${Math.random().toString(36).slice(2, 8)}`),
}));

describe('bootstrapTenantCoa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should insert classifications and accounts from templates', async () => {
    const classificationTemplates = [
      { id: 'ct-1', templateKey: 'shared', name: 'Cash & Bank', accountType: 'asset', sortOrder: 10 },
      { id: 'ct-2', templateKey: 'shared', name: 'Payables', accountType: 'liability', sortOrder: 20 },
    ];

    const accountTemplates = [
      { id: 'at-1', templateKey: 'golf_default', accountNumber: '1010', name: 'Cash on Hand', accountType: 'asset', normalBalance: 'debit', classificationName: 'Cash & Bank', isControlAccount: false, controlAccountType: null, sortOrder: 10 },
      { id: 'at-2', templateKey: 'golf_default', accountNumber: '2000', name: 'Accounts Payable', accountType: 'liability', normalBalance: 'credit', classificationName: 'Payables', isControlAccount: true, controlAccountType: 'ap', sortOrder: 200 },
      { id: 'at-3', templateKey: 'golf_default', accountNumber: '3000', name: 'Retained Earnings', accountType: 'equity', normalBalance: 'credit', classificationName: 'Retained Earnings', isControlAccount: false, controlAccountType: null, sortOrder: 300 },
      { id: 'at-4', templateKey: 'golf_default', accountNumber: '9999', name: 'Rounding', accountType: 'expense', normalBalance: 'debit', classificationName: 'System Accounts', isControlAccount: false, controlAccountType: null, sortOrder: 999 },
    ];

    let insertedClassifications: any[] = [];
    let insertedAccounts: any[] = [];
    let insertedSettings: any = null;

    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn()
        .mockResolvedValueOnce(classificationTemplates) // classification templates
        .mockResolvedValueOnce(accountTemplates),        // account templates
      insert: vi.fn().mockReturnThis(),
      values: vi.fn(function(this: any, vals: any) {
        // Determine which table based on field presence
        if (vals.accountNumber) {
          insertedAccounts.push(vals);
        } else if (vals.accountType) {
          insertedClassifications.push(vals);
        } else {
          insertedSettings = vals;
        }
        return this;
      }),
      returning: vi.fn().mockResolvedValue([{}]),
    };

    const result = await bootstrapTenantCoa(mockTx as any, 'tenant-1', 'golf_default');

    expect(result.classificationCount).toBe(2);
    expect(result.accountCount).toBe(4);
    expect(insertedClassifications.length).toBe(2);
    expect(insertedAccounts.length).toBe(4);
    expect(insertedSettings).toBeDefined();
    expect(insertedSettings.tenantId).toBe('tenant-1');
    // AP control should be set
    expect(insertedSettings.defaultAPControlAccountId).toBeDefined();
    // Rounding account should be set
    expect(insertedSettings.defaultRoundingAccountId).toBeDefined();
  });

  it('should throw if no templates found for key', async () => {
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn()
        .mockResolvedValueOnce([{ id: 'ct-1', name: 'Cash', accountType: 'asset', sortOrder: 10 }]) // shared classifications
        .mockResolvedValueOnce([]), // empty account templates
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{}]),
    };

    await expect(bootstrapTenantCoa(mockTx as any, 'tenant-1', 'nonexistent_key'))
      .rejects.toThrow('No account templates found');
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
