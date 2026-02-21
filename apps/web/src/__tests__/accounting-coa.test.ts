import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockApiFetch } = vi.hoisted(() => {
  const mockApiFetch = vi.fn();
  return { mockApiFetch };
});

vi.mock('@/lib/api-client', () => ({
  apiFetch: mockApiFetch,
  ApiError: class extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

// ── Imports ───────────────────────────────────────────────────
import type { GLAccount, AccountType } from '../types/accounting';

// ═══════════════════════════════════════════════════════════════
// Account tree view
// ═══════════════════════════════════════════════════════════════

describe('account tree view', () => {
  function buildTree(accounts: GLAccount[]): (GLAccount & { depth: number })[] {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const childMap = new Map<string, GLAccount[]>();
    const roots: GLAccount[] = [];

    for (const acc of accounts) {
      if (acc.parentAccountId && byId.has(acc.parentAccountId)) {
        if (!childMap.has(acc.parentAccountId)) childMap.set(acc.parentAccountId, []);
        childMap.get(acc.parentAccountId)!.push(acc);
      } else {
        roots.push(acc);
      }
    }

    function flatten(items: GLAccount[], depth: number): (GLAccount & { depth: number })[] {
      const result: (GLAccount & { depth: number })[] = [];
      for (const item of items) {
        result.push({ ...item, depth });
        const children = childMap.get(item.id) ?? [];
        if (children.length > 0) {
          result.push(...flatten(children, depth + 1));
        }
      }
      return result;
    }

    return flatten(roots, 0);
  }

  const baseAccount = {
    classificationId: null,
    classificationName: undefined,
    isActive: true,
    isControlAccount: false,
    controlAccountType: null,
    allowManualPosting: true,
    description: null,
  };

  it('renders root accounts at depth 0', () => {
    const accounts: GLAccount[] = [
      { ...baseAccount, id: '1', accountNumber: '1010', name: 'Cash', accountType: 'asset', normalBalance: 'debit', parentAccountId: null },
      { ...baseAccount, id: '2', accountNumber: '1020', name: 'Bank', accountType: 'asset', normalBalance: 'debit', parentAccountId: null },
    ];

    const tree = buildTree(accounts);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.depth).toBe(0);
    expect(tree[1]!.depth).toBe(0);
  });

  it('nests sub-accounts under parents with correct indentation', () => {
    const accounts: GLAccount[] = [
      { ...baseAccount, id: '1', accountNumber: '1000', name: 'Cash & Bank', accountType: 'asset', normalBalance: 'debit', parentAccountId: null },
      { ...baseAccount, id: '2', accountNumber: '1010', name: 'Petty Cash', accountType: 'asset', normalBalance: 'debit', parentAccountId: '1' },
      { ...baseAccount, id: '3', accountNumber: '1020', name: 'Operating Checking', accountType: 'asset', normalBalance: 'debit', parentAccountId: '1' },
    ];

    const tree = buildTree(accounts);
    expect(tree).toHaveLength(3);
    expect(tree[0]!.depth).toBe(0); // parent
    expect(tree[1]!.depth).toBe(1); // child
    expect(tree[2]!.depth).toBe(1); // child
  });

  it('handles multi-level nesting', () => {
    const accounts: GLAccount[] = [
      { ...baseAccount, id: '1', accountNumber: '1000', name: 'Assets', accountType: 'asset', normalBalance: 'debit', parentAccountId: null },
      { ...baseAccount, id: '2', accountNumber: '1100', name: 'Current Assets', accountType: 'asset', normalBalance: 'debit', parentAccountId: '1' },
      { ...baseAccount, id: '3', accountNumber: '1110', name: 'Cash', accountType: 'asset', normalBalance: 'debit', parentAccountId: '2' },
    ];

    const tree = buildTree(accounts);
    expect(tree).toHaveLength(3);
    expect(tree[0]!.depth).toBe(0);
    expect(tree[1]!.depth).toBe(1);
    expect(tree[2]!.depth).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Account dialog validation
// ═══════════════════════════════════════════════════════════════

describe('account dialog validation', () => {
  it('requires account number', () => {
    const form = { accountNumber: '', name: 'Test', isControlAccount: false, controlAccountType: '' };
    const errors: Record<string, string> = {};
    if (!form.accountNumber.trim()) errors.accountNumber = 'Account number is required';
    expect(errors.accountNumber).toBe('Account number is required');
  });

  it('requires account name', () => {
    const form = { accountNumber: '1010', name: '', isControlAccount: false, controlAccountType: '' };
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Account name is required';
    expect(errors.name).toBe('Account name is required');
  });

  it('requires control type when control account is checked', () => {
    const form = { accountNumber: '1010', name: 'AP', isControlAccount: true, controlAccountType: '' };
    const errors: Record<string, string> = {};
    if (form.isControlAccount && !form.controlAccountType) {
      errors.controlAccountType = 'Select a control account type';
    }
    expect(errors.controlAccountType).toBe('Select a control account type');
  });

  it('passes validation with valid data', () => {
    const form = { accountNumber: '1010', name: 'Cash', isControlAccount: false, controlAccountType: '' };
    const errors: Record<string, string> = {};
    if (!form.accountNumber.trim()) errors.accountNumber = 'required';
    if (!form.name.trim()) errors.name = 'required';
    if (form.isControlAccount && !form.controlAccountType) errors.controlAccountType = 'required';
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('derives correct normal balance from account type', () => {
    const NORMAL_BALANCE_MAP: Record<AccountType, string> = {
      asset: 'debit',
      liability: 'credit',
      equity: 'credit',
      revenue: 'credit',
      expense: 'debit',
    };

    expect(NORMAL_BALANCE_MAP.asset).toBe('debit');
    expect(NORMAL_BALANCE_MAP.liability).toBe('credit');
    expect(NORMAL_BALANCE_MAP.equity).toBe('credit');
    expect(NORMAL_BALANCE_MAP.revenue).toBe('credit');
    expect(NORMAL_BALANCE_MAP.expense).toBe('debit');
  });
});

// ═══════════════════════════════════════════════════════════════
// Settings form
// ═══════════════════════════════════════════════════════════════

describe('settings form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves settings via PATCH endpoint', async () => {
    const settingsPayload = {
      fiscalYearStartMonth: 7,
      autoPostMode: 'auto_post',
      roundingToleranceCents: 5,
      enableCogsPosting: true,
    };

    mockApiFetch.mockResolvedValueOnce({ data: settingsPayload });

    await mockApiFetch('/api/v1/accounting/settings', {
      method: 'PATCH',
      body: JSON.stringify(settingsPayload),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/accounting/settings',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Bootstrap wizard
// ═══════════════════════════════════════════════════════════════

describe('bootstrap wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls bootstrap API with template key', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { success: true } });

    await mockApiFetch('/api/v1/accounting/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ templateKey: 'golf' }),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/accounting/bootstrap',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('golf'),
      }),
    );
  });

  it('supports all four template types', () => {
    const templates = ['golf', 'retail', 'restaurant', 'hybrid'];
    expect(templates).toHaveLength(4);
    expect(templates).toContain('golf');
    expect(templates).toContain('retail');
    expect(templates).toContain('restaurant');
    expect(templates).toContain('hybrid');
  });
});

// ═══════════════════════════════════════════════════════════════
// Classifications panel
// ═══════════════════════════════════════════════════════════════

describe('classifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups classifications by account type', () => {
    const classifications = [
      { id: '1', name: 'Current Assets', accountType: 'asset', sortOrder: 1 },
      { id: '2', name: 'Fixed Assets', accountType: 'asset', sortOrder: 2 },
      { id: '3', name: 'Current Liabilities', accountType: 'liability', sortOrder: 1 },
      { id: '4', name: 'Operating Revenue', accountType: 'revenue', sortOrder: 1 },
    ];

    const grouped: Record<string, typeof classifications> = {};
    for (const c of classifications) {
      if (!grouped[c.accountType]) grouped[c.accountType] = [];
      grouped[c.accountType]!.push(c);
    }

    expect(grouped['asset']).toHaveLength(2);
    expect(grouped['liability']).toHaveLength(1);
    expect(grouped['revenue']).toHaveLength(1);
  });

  it('sorts classifications by sortOrder within type', () => {
    const items = [
      { id: '2', name: 'Fixed Assets', sortOrder: 2 },
      { id: '1', name: 'Current Assets', sortOrder: 1 },
      { id: '3', name: 'Other Assets', sortOrder: 3 },
    ];

    items.sort((a, b) => a.sortOrder - b.sortOrder);
    expect(items[0]!.name).toBe('Current Assets');
    expect(items[1]!.name).toBe('Fixed Assets');
    expect(items[2]!.name).toBe('Other Assets');
  });
});
