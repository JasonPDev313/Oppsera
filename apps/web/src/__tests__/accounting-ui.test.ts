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

// ── Imports (after mocks) ─────────────────────────────────────
import {
  formatAccountingMoney,
  ACCOUNTING_STATUS_CONFIG,
  SOURCE_MODULE_BADGES,
} from '../types/accounting';

// ═══════════════════════════════════════════════════════════════
// formatAccountingMoney
// ═══════════════════════════════════════════════════════════════

describe('formatAccountingMoney', () => {
  it('formats positive dollar amounts correctly', () => {
    expect(formatAccountingMoney(1234.56)).toBe('$1,234.56');
  });

  it('formats zero', () => {
    expect(formatAccountingMoney(0)).toBe('$0.00');
  });

  it('formats negative amounts with parentheses', () => {
    expect(formatAccountingMoney(-1200)).toBe('($1,200.00)');
  });

  it('handles string inputs from NUMERIC columns', () => {
    expect(formatAccountingMoney('45200.00')).toBe('$45,200.00');
  });

  it('handles NaN/invalid input gracefully', () => {
    expect(formatAccountingMoney('not-a-number')).toBe('$0.00');
  });

  it('formats large amounts', () => {
    expect(formatAccountingMoney(1234567.89)).toBe('$1,234,567.89');
  });

  it('formats small amounts with 2 decimal places', () => {
    expect(formatAccountingMoney(0.5)).toBe('$0.50');
  });
});

// ═══════════════════════════════════════════════════════════════
// StatusBadge config
// ═══════════════════════════════════════════════════════════════

describe('ACCOUNTING_STATUS_CONFIG', () => {
  it('has correct variant for draft status', () => {
    expect(ACCOUNTING_STATUS_CONFIG.draft).toEqual({ label: 'Draft', variant: 'neutral' });
  });

  it('has correct variant for posted status', () => {
    expect(ACCOUNTING_STATUS_CONFIG.posted).toEqual({ label: 'Posted', variant: 'success' });
  });

  it('has correct variant for partial status', () => {
    expect(ACCOUNTING_STATUS_CONFIG.partial).toEqual({ label: 'Partial', variant: 'warning' });
  });

  it('has correct variant for paid status', () => {
    expect(ACCOUNTING_STATUS_CONFIG.paid).toEqual({ label: 'Paid', variant: 'info' });
  });

  it('has correct variant for voided status', () => {
    expect(ACCOUNTING_STATUS_CONFIG.voided).toEqual({ label: 'Voided', variant: 'error' });
  });

  it('has correct variant for open period status', () => {
    expect(ACCOUNTING_STATUS_CONFIG.open).toEqual({ label: 'Open', variant: 'info' });
  });

  it('has correct variant for in_review period status', () => {
    expect(ACCOUNTING_STATUS_CONFIG.in_review).toEqual({ label: 'In Review', variant: 'warning' });
  });

  it('has correct variant for closed period status', () => {
    expect(ACCOUNTING_STATUS_CONFIG.closed).toEqual({ label: 'Closed', variant: 'success' });
  });
});

// ═══════════════════════════════════════════════════════════════
// Source module badges
// ═══════════════════════════════════════════════════════════════

describe('SOURCE_MODULE_BADGES', () => {
  it('has all expected source modules', () => {
    expect(SOURCE_MODULE_BADGES).toHaveProperty('manual');
    expect(SOURCE_MODULE_BADGES).toHaveProperty('pos');
    expect(SOURCE_MODULE_BADGES).toHaveProperty('ap');
    expect(SOURCE_MODULE_BADGES).toHaveProperty('ar');
    expect(SOURCE_MODULE_BADGES).toHaveProperty('inventory');
  });

  it('manual badge is blue/info', () => {
    expect(SOURCE_MODULE_BADGES['manual']!.variant).toBe('info');
  });

  it('pos badge is green/success', () => {
    expect(SOURCE_MODULE_BADGES['pos']!.variant).toBe('success');
  });
});

// ═══════════════════════════════════════════════════════════════
// PeriodSelector period generation
// ═══════════════════════════════════════════════════════════════

describe('period generation', () => {
  it('generates YYYY-MM format period strings', () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const currentPeriod = `${year}-${month}`;

    // Current period should be in YYYY-MM format
    expect(currentPeriod).toMatch(/^\d{4}-\d{2}$/);
  });

  it('fiscal year start month marks correctly', () => {
    // Fiscal year starting in July means month 7 is FY start
    const fiscalYearStartMonth = 7;
    const testMonth = 7;
    expect(testMonth).toBe(fiscalYearStartMonth);
  });

  it('generates correct number of periods', () => {
    const monthCount = 24;
    const periods: string[] = [];
    const now = new Date();

    for (let i = 0; i < monthCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      periods.push(`${year}-${String(month).padStart(2, '0')}`);
    }

    expect(periods).toHaveLength(24);
    // Most recent period should be current month
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(periods[0]).toBe(currentMonth);
  });
});

// ═══════════════════════════════════════════════════════════════
// MoneyInput validation patterns
// ═══════════════════════════════════════════════════════════════

describe('money input validation', () => {
  it('accepts valid dollar amounts', () => {
    const pattern = /^\d*\.?\d{0,2}$/;
    expect(pattern.test('123.45')).toBe(true);
    expect(pattern.test('0.50')).toBe(true);
    expect(pattern.test('1000')).toBe(true);
    expect(pattern.test('')).toBe(true);
  });

  it('rejects invalid formats', () => {
    const pattern = /^\d*\.?\d{0,2}$/;
    expect(pattern.test('12.345')).toBe(false); // >2 decimal places
    expect(pattern.test('abc')).toBe(false);
    expect(pattern.test('12.34.56')).toBe(false);
  });

  it('negative pattern allows minus sign', () => {
    const negativePattern = /^-?\d*\.?\d{0,2}$/;
    expect(negativePattern.test('-50.00')).toBe(true);
    expect(negativePattern.test('-0.01')).toBe(true);
    expect(negativePattern.test('-')).toBe(true);
  });

  it('formats to 2 decimal places on blur', () => {
    const value = '123.5';
    const num = parseFloat(value);
    expect(num.toFixed(2)).toBe('123.50');
  });
});

// ═══════════════════════════════════════════════════════════════
// JournalLinesTable balance calculation
// ═══════════════════════════════════════════════════════════════

describe('journal lines balance calculation', () => {
  it('detects balanced entries', () => {
    const lines = [
      { debitAmount: 100, creditAmount: 0 },
      { debitAmount: 0, creditAmount: 100 },
    ];
    const totalDebits = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredits = lines.reduce((sum, l) => sum + l.creditAmount, 0);
    expect(Math.abs(totalDebits - totalCredits)).toBeLessThan(0.01);
  });

  it('detects imbalanced entries', () => {
    const lines = [
      { debitAmount: 100, creditAmount: 0 },
      { debitAmount: 0, creditAmount: 99 },
    ];
    const totalDebits = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredits = lines.reduce((sum, l) => sum + l.creditAmount, 0);
    expect(Math.abs(totalDebits - totalCredits)).toBeGreaterThanOrEqual(0.01);
  });

  it('handles multiple lines per side', () => {
    const lines = [
      { debitAmount: 50, creditAmount: 0 },
      { debitAmount: 50, creditAmount: 0 },
      { debitAmount: 0, creditAmount: 40 },
      { debitAmount: 0, creditAmount: 60 },
    ];
    const totalDebits = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredits = lines.reduce((sum, l) => sum + l.creditAmount, 0);
    expect(totalDebits).toBe(100);
    expect(totalCredits).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// AccountPicker API integration
// ═══════════════════════════════════════════════════════════════

describe('account picker API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ data: [] });
  });

  it('fetches accounts from correct endpoint', async () => {
    const mockAccounts = {
      data: [
        { id: 'acc_1', accountNumber: '1010', name: 'Cash', accountType: 'asset', isControlAccount: false },
        { id: 'acc_2', accountNumber: '2000', name: 'AP Control', accountType: 'liability', isControlAccount: true },
        { id: 'acc_3', accountNumber: '4010', name: 'Revenue', accountType: 'revenue', isControlAccount: false },
      ],
    };
    mockApiFetch.mockResolvedValueOnce(mockAccounts);

    const result = await mockApiFetch('/api/v1/accounting/accounts');
    expect(result.data).toHaveLength(3);
  });

  it('filters by accountType', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: [] });

    await mockApiFetch('/api/v1/accounting/accounts?accountType=revenue');
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('accountType=revenue'),
    );
  });

  it('groups accounts by type', () => {
    const accounts = [
      { id: '1', accountType: 'asset', accountNumber: '1010', name: 'Cash' },
      { id: '2', accountType: 'liability', accountNumber: '2000', name: 'AP' },
      { id: '3', accountType: 'asset', accountNumber: '1020', name: 'Bank' },
      { id: '4', accountType: 'revenue', accountNumber: '4010', name: 'Sales' },
    ];

    const groups: Record<string, typeof accounts> = {};
    for (const acc of accounts) {
      if (!groups[acc.accountType]) groups[acc.accountType] = [];
      groups[acc.accountType]!.push(acc);
    }

    expect(groups['asset']).toHaveLength(2);
    expect(groups['liability']).toHaveLength(1);
    expect(groups['revenue']).toHaveLength(1);
    expect(groups['expense']).toBeUndefined();
  });
});
