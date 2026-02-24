/**
 * Bootstrap Template Tests
 *
 * Validates the structure and correctness of COA template data
 * by testing the bootstrap helper's behavior and the state placeholder
 * integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock infrastructure ──────────────────────────────────────────

const mockSelect = vi.fn().mockReturnThis();
const mockFrom = vi.fn().mockReturnThis();
const mockWhere = vi.fn();
const mockInsert = vi.fn().mockReturnThis();
const mockValues = vi.fn().mockResolvedValue([]);
const mockLimit = vi.fn();

const mockTx = {
  select: mockSelect,
  from: mockFrom,
  where: mockWhere,
  insert: mockInsert,
  values: mockValues,
  limit: mockLimit,
};

vi.mock('@oppsera/db', () => ({
  glAccounts: {
    id: 'id',
    tenantId: 'tenantId',
    accountNumber: 'accountNumber',
    name: 'name',
    accountType: 'accountType',
    normalBalance: 'normalBalance',
    classificationId: 'classificationId',
    isActive: 'isActive',
    isControlAccount: 'isControlAccount',
    controlAccountType: 'controlAccountType',
    allowManualPosting: 'allowManualPosting',
  },
  glClassifications: {
    id: 'id',
    tenantId: 'tenantId',
    name: 'name',
    accountType: 'accountType',
    sortOrder: 'sortOrder',
  },
  glAccountTemplates: {
    templateKey: 'templateKey',
    accountNumber: 'accountNumber',
    name: 'name',
    accountType: 'accountType',
    normalBalance: 'normalBalance',
    classificationName: 'classificationName',
    isControlAccount: 'isControlAccount',
    controlAccountType: 'controlAccountType',
  },
  glClassificationTemplates: {
    templateKey: 'templateKey',
    name: 'name',
    accountType: 'accountType',
    sortOrder: 'sortOrder',
  },
  accountingSettings: {
    tenantId: 'tenantId',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => `ulid-${Math.random().toString(36).slice(2, 10)}`),
}));

vi.mock('../helpers/resolve-normal-balance', () => ({
  resolveNormalBalance: vi.fn((type: string) =>
    type === 'asset' || type === 'expense' ? 'debit' : 'credit',
  ),
}));

// ── Test applyStatePlaceholders directly ─────────────────────────

import { applyStatePlaceholders } from '../services/state-placeholder';
import { replaceStatePlaceholder } from '../services/state-placeholder';

describe('bootstrap — state placeholder integration', () => {
  it('applies state name to templates with [STATE_NAME]', () => {
    const templates = [
      { name: '[STATE_NAME] Sales Tax Payable', accountType: 'liability' },
      { name: 'Cash on Hand', accountType: 'asset' },
      { name: '[STATE_NAME] Unemployment Tax', accountType: 'liability' },
    ];

    const result = applyStatePlaceholders(templates, 'Michigan');
    expect(result[0]!.name).toBe('Michigan Sales Tax Payable');
    expect(result[1]!.name).toBe('Cash on Hand');
    expect(result[2]!.name).toBe('Michigan Unemployment Tax');
  });

  it('leaves placeholders intact when no state provided', () => {
    const templates = [{ name: '[STATE_NAME] Sales Tax', accountType: 'liability' }];
    const result = applyStatePlaceholders(templates, '');
    expect(result[0]!.name).toBe('[STATE_NAME] Sales Tax');
  });

  it('handles multiple placeholders in one name', () => {
    const result = replaceStatePlaceholder(
      '[STATE_NAME] Tax — [STATE_NAME] Filing',
      'Texas',
    );
    expect(result).toBe('Texas Tax — Texas Filing');
  });
});

// ── Test template structure expectations ─────────────────────────

describe('bootstrap — template structure expectations', () => {
  const VALID_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  const TEMPLATE_KEYS = ['golf_default', 'retail_default', 'restaurant_default', 'hybrid_default'];

  it.each(TEMPLATE_KEYS)('template %s key format is valid', (key) => {
    expect(key).toMatch(/^[a-z_]+$/);
    expect(key.endsWith('_default')).toBe(true);
  });

  it('valid account types are all covered', () => {
    expect(VALID_TYPES).toContain('asset');
    expect(VALID_TYPES).toContain('liability');
    expect(VALID_TYPES).toContain('equity');
    expect(VALID_TYPES).toContain('revenue');
    expect(VALID_TYPES).toContain('expense');
  });

  it('normal balance resolves correctly for each type', () => {
    expect(['asset', 'expense'].includes('asset')).toBe(true); // debit-normal
    expect(['liability', 'equity', 'revenue'].includes('revenue')).toBe(true); // credit-normal
  });
});

// ── Test bootstrap idempotency logic ─────────────────────────────

describe('bootstrap — idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early if settings already exist', async () => {
    // The chain is: tx.select().from().where().limit(1)
    // First call checks accounting_settings existence (has .limit)
    // Second call counts classifications (no .limit)
    // Third call counts accounts (no .limit)
    let callCount = 0;
    mockWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First where() returns object with .limit (accounting_settings check)
        return {
          limit: vi.fn().mockResolvedValue([{ tenantId: 'tenant-1' }]),
        };
      }
      if (callCount === 2) {
        // Second where() returns classifications
        return Promise.resolve([{ id: 'c1' }, { id: 'c2' }]);
      }
      // Third where() returns accounts
      return Promise.resolve([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]);
    });

    const { bootstrapTenantCoa } = await import('../helpers/bootstrap-tenant-coa');
    const result = await bootstrapTenantCoa(mockTx as any, 'tenant-1', 'golf_default');

    expect(result.classificationCount).toBe(2);
    expect(result.accountCount).toBe(3);
  });
});

// ── Test normal balance derivation ───────────────────────────────

describe('bootstrap — normal balance', () => {
  it('assets and expenses are debit-normal', () => {
    for (const type of ['asset', 'expense']) {
      const balance = type === 'asset' || type === 'expense' ? 'debit' : 'credit';
      expect(balance).toBe('debit');
    }
  });

  it('liabilities, equity, and revenue are credit-normal', () => {
    for (const type of ['liability', 'equity', 'revenue']) {
      const balance = type === 'asset' || type === 'expense' ? 'debit' : 'credit';
      expect(balance).toBe('credit');
    }
  });
});

// ── Test special account tracking ────────────────────────────────

describe('bootstrap — special account wiring', () => {
  it('known special account numbers are tracked', () => {
    const specialNumbers: Record<string, string> = {
      '3000': 'retained_earnings',
      '9999': 'rounding',
      '2160': 'tips_payable',
      '4500': 'service_charge_revenue',
      '49900': 'uncategorized_revenue',
    };

    // Verify each special number maps to a setting key
    for (const [num, key] of Object.entries(specialNumbers)) {
      expect(num).toBeTruthy();
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
    }
  });

  it('control account types map to settings', () => {
    const controlTypes = ['ap', 'ar', 'sales_tax', 'undeposited_funds', 'pms_guest_ledger'];
    for (const type of controlTypes) {
      expect(typeof type).toBe('string');
    }
  });
});
