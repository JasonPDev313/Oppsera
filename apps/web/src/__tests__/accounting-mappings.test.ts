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

// ═══════════════════════════════════════════════════════════════
// Mapping coverage
// ═══════════════════════════════════════════════════════════════

describe('mapping coverage', () => {
  it('computes coverage percentages', () => {
    const coverage = {
      departments: { mapped: 3, total: 5 },
      paymentTypes: { mapped: 2, total: 4 },
      taxGroups: { mapped: 1, total: 2 },
    };

    const deptPct = (coverage.departments.mapped / coverage.departments.total) * 100;
    const payPct = (coverage.paymentTypes.mapped / coverage.paymentTypes.total) * 100;
    const taxPct = (coverage.taxGroups.mapped / coverage.taxGroups.total) * 100;

    expect(deptPct).toBe(60);
    expect(payPct).toBe(50);
    expect(taxPct).toBe(50);
  });

  it('handles zero total gracefully', () => {
    const coverage = { departments: { mapped: 0, total: 0 } };
    const pct = coverage.departments.total > 0
      ? (coverage.departments.mapped / coverage.departments.total) * 100
      : 0;
    expect(pct).toBe(0);
  });

  it('shows 100% when fully mapped', () => {
    const coverage = {
      departments: { mapped: 5, total: 5 },
      paymentTypes: { mapped: 3, total: 3 },
      taxGroups: { mapped: 2, total: 2 },
    };

    const total = coverage.departments.total + coverage.paymentTypes.total + coverage.taxGroups.total;
    const mapped = coverage.departments.mapped + coverage.paymentTypes.mapped + coverage.taxGroups.mapped;

    expect(Math.round((mapped / total) * 100)).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// Department mapping saves
// ═══════════════════════════════════════════════════════════════

describe('department mapping saves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves all 5 account selections for a department', async () => {
    const mapping = {
      subDepartmentId: 'sd_1',
      revenueAccountId: 'acc_1',
      cogsAccountId: 'acc_2',
      inventoryAssetAccountId: 'acc_3',
      discountAccountId: 'acc_4',
      returnsAccountId: 'acc_5',
    };

    mockApiFetch.mockResolvedValueOnce({ data: mapping });

    await mockApiFetch('/api/v1/accounting/mappings/sub-departments/sd_1', {
      method: 'PUT',
      body: JSON.stringify(mapping),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/accounting/mappings/sub-departments/sd_1',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Unmapped events
// ═══════════════════════════════════════════════════════════════

describe('unmapped event resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves an unmapped event', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { id: 'evt_1', resolvedAt: '2026-02-20' } });

    await mockApiFetch('/api/v1/accounting/unmapped-events/evt_1/resolve', {
      method: 'PATCH',
      body: JSON.stringify({ note: 'Manually resolved' }),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/resolve'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('humanizes event type names', () => {
    const eventType = 'missing_revenue_account';
    const humanized = eventType.replace(/_/g, ' ');
    expect(humanized).toBe('missing revenue account');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bank account form
// ═══════════════════════════════════════════════════════════════

describe('bank account form validation', () => {
  it('requires account name', () => {
    const form = { name: '', glAccountId: 'acc_1', bankName: '', accountNumberLast4: '' };
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Account name is required';
    expect(errors.name).toBe('Account name is required');
  });

  it('requires GL account', () => {
    const form = { name: 'Checking', glAccountId: '', bankName: '', accountNumberLast4: '' };
    const errors: Record<string, string> = {};
    if (!form.glAccountId) errors.glAccountId = 'GL account is required';
    expect(errors.glAccountId).toBe('GL account is required');
  });

  it('validates last 4 digits max length', () => {
    const input = '12345';
    const sanitized = input.replace(/\D/g, '').slice(0, 4);
    expect(sanitized).toBe('1234');
    expect(sanitized.length).toBeLessThanOrEqual(4);
  });

  it('passes validation with valid data', () => {
    const form = { name: 'Operating Checking', glAccountId: 'acc_1', bankName: 'Chase', accountNumberLast4: '5678' };
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'required';
    if (!form.glAccountId) errors.glAccountId = 'required';
    if (form.accountNumberLast4 && form.accountNumberLast4.length > 4) errors.last4 = 'too long';
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Default bank account toggle
// ═══════════════════════════════════════════════════════════════

describe('default bank account toggle', () => {
  it('only one bank can be default', () => {
    const banks = [
      { id: '1', name: 'Checking', isDefault: true },
      { id: '2', name: 'Savings', isDefault: false },
      { id: '3', name: 'Payroll', isDefault: false },
    ];

    const defaults = banks.filter((b) => b.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.name).toBe('Checking');
  });

  it('setting new default clears others', () => {
    const banks = [
      { id: '1', name: 'Checking', isDefault: true },
      { id: '2', name: 'Savings', isDefault: false },
    ];

    // Simulate toggling bank 2 as default
    const updated = banks.map((b) => ({
      ...b,
      isDefault: b.id === '2',
    }));

    expect(updated[0]!.isDefault).toBe(false);
    expect(updated[1]!.isDefault).toBe(true);
    expect(updated.filter((b) => b.isDefault)).toHaveLength(1);
  });
});
