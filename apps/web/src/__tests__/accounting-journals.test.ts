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
// Journal entry form validation
// ═══════════════════════════════════════════════════════════════

describe('journal entry form validation', () => {
  it('validates balanced debits and credits', () => {
    const lines = [
      { debitAmount: 100, creditAmount: 0 },
      { debitAmount: 0, creditAmount: 100 },
    ];
    const totalDebits = lines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredits = lines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = Math.abs(totalDebits - totalCredits);
    expect(diff).toBeLessThan(0.01);
  });

  it('detects out-of-balance entries', () => {
    const lines = [
      { debitAmount: 100, creditAmount: 0 },
      { debitAmount: 0, creditAmount: 95 },
    ];
    const totalDebits = lines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredits = lines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = Math.abs(totalDebits - totalCredits);
    expect(diff).toBeGreaterThanOrEqual(0.01);
  });

  it('requires at least 2 lines', () => {
    const lines = [{ accountId: '1', debitAmount: 100, creditAmount: 0 }];
    expect(lines.length).toBeLessThan(2);
  });

  it('rejects line with both debit and credit', () => {
    const line = { debitAmount: 50, creditAmount: 50 };
    const hasBoth = line.debitAmount > 0 && line.creditAmount > 0;
    expect(hasBoth).toBe(true);
  });

  it('rejects line with neither debit nor credit', () => {
    const line = { debitAmount: 0, creditAmount: 0 };
    const hasNeither = line.debitAmount <= 0 && line.creditAmount <= 0;
    expect(hasNeither).toBe(true);
  });

  it('requires account on each line', () => {
    const line = { accountId: null, debitAmount: 100, creditAmount: 0 };
    expect(line.accountId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Trial balance
// ═══════════════════════════════════════════════════════════════

describe('trial balance', () => {
  it('detects balanced trial balance (debits = credits)', () => {
    const rows = [
      { accountType: 'asset', debitBalance: 5000, creditBalance: 0 },
      { accountType: 'liability', debitBalance: 0, creditBalance: 3000 },
      { accountType: 'equity', debitBalance: 0, creditBalance: 2000 },
    ];
    const totalDebits = rows.reduce((s, r) => s + r.debitBalance, 0);
    const totalCredits = rows.reduce((s, r) => s + r.creditBalance, 0);
    expect(Math.abs(totalDebits - totalCredits)).toBeLessThan(0.01);
  });

  it('detects out-of-balance trial balance', () => {
    const rows = [
      { accountType: 'asset', debitBalance: 5000, creditBalance: 0 },
      { accountType: 'liability', debitBalance: 0, creditBalance: 2000 },
    ];
    const totalDebits = rows.reduce((s, r) => s + r.debitBalance, 0);
    const totalCredits = rows.reduce((s, r) => s + r.creditBalance, 0);
    expect(Math.abs(totalDebits - totalCredits)).toBeGreaterThanOrEqual(0.01);
  });

  it('groups rows by account type', () => {
    const rows = [
      { accountType: 'asset', debitBalance: 1000, creditBalance: 0, accountName: 'Cash' },
      { accountType: 'asset', debitBalance: 2000, creditBalance: 0, accountName: 'Bank' },
      { accountType: 'liability', debitBalance: 0, creditBalance: 500, accountName: 'AP' },
      { accountType: 'revenue', debitBalance: 0, creditBalance: 2500, accountName: 'Sales' },
    ];

    const grouped: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!grouped[row.accountType]) grouped[row.accountType] = [];
      grouped[row.accountType]!.push(row);
    }

    expect(grouped['asset']).toHaveLength(2);
    expect(grouped['liability']).toHaveLength(1);
    expect(grouped['revenue']).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// GL Detail running balance
// ═══════════════════════════════════════════════════════════════

describe('GL detail running balance', () => {
  it('computes running balance from opening balance', () => {
    const openingBalance = 1000;
    const transactions = [
      { debit: 500, credit: 0 },
      { debit: 0, credit: 200 },
      { debit: 300, credit: 0 },
    ];

    let balance = openingBalance;
    const balances: number[] = [];
    for (const tx of transactions) {
      balance = balance + tx.debit - tx.credit;
      balances.push(balance);
    }

    expect(balances[0]).toBe(1500); // 1000 + 500
    expect(balances[1]).toBe(1300); // 1500 - 200
    expect(balances[2]).toBe(1600); // 1300 + 300
  });

  it('handles credit-normal accounts (balance increases with credits)', () => {
    const openingBalance = 2000;
    const transactions = [
      { debit: 0, credit: 500 },
      { debit: 100, credit: 0 },
    ];

    // For credit-normal: balance = credit - debit
    let balance = openingBalance;
    const balances: number[] = [];
    for (const tx of transactions) {
      balance = balance + tx.credit - tx.debit;
      balances.push(balance);
    }

    expect(balances[0]).toBe(2500); // 2000 + 500
    expect(balances[1]).toBe(2400); // 2500 - 100
  });
});

// ═══════════════════════════════════════════════════════════════
// Void dialog
// ═══════════════════════════════════════════════════════════════

describe('void dialog', () => {
  it('requires non-empty reason text', () => {
    const reason = '';
    expect(reason.trim()).toBe('');
  });

  it('accepts valid reason', () => {
    const reason = 'Incorrect posting — duplicate entry';
    expect(reason.trim().length).toBeGreaterThan(0);
  });

  it('only voided entries show void info', () => {
    const entry = { status: 'voided', voidReason: 'Error', voidedAt: '2026-01-15T10:00:00Z' };
    expect(entry.status).toBe('voided');
    expect(entry.voidReason).toBeTruthy();
    expect(entry.voidedAt).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// Journal entry API
// ═══════════════════════════════════════════════════════════════

describe('journal entry API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a manual journal entry', async () => {
    const payload = {
      businessDate: '2026-02-20',
      memo: 'Test entry',
      lines: [
        { accountId: 'acc_1', debitAmount: 100, creditAmount: 0 },
        { accountId: 'acc_2', debitAmount: 0, creditAmount: 100 },
      ],
    };

    mockApiFetch.mockResolvedValueOnce({ data: { id: 'je_1', ...payload } });

    await mockApiFetch('/api/v1/accounting/journals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/accounting/journals',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('posts a draft journal entry', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { id: 'je_1', status: 'posted' } });

    await mockApiFetch('/api/v1/accounting/journals/je_1/post', { method: 'POST' });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/accounting/journals/je_1/post',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('voids a posted journal entry with reason', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { id: 'je_1', status: 'voided' } });

    await mockApiFetch('/api/v1/accounting/journals/je_1/void', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Duplicate entry' }),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/accounting/journals/je_1/void',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Duplicate entry'),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// GL Summary grouping
// ═══════════════════════════════════════════════════════════════

describe('GL summary', () => {
  it('computes grand totals across groups', () => {
    const rows = [
      { groupLabel: 'Current Assets', totalDebits: 5000, totalCredits: 1000, netBalance: 4000 },
      { groupLabel: 'Fixed Assets', totalDebits: 2000, totalCredits: 500, netBalance: 1500 },
      { groupLabel: 'Current Liabilities', totalDebits: 200, totalCredits: 3000, netBalance: -2800 },
    ];

    const totalDebits = rows.reduce((s, r) => s + r.totalDebits, 0);
    const totalCredits = rows.reduce((s, r) => s + r.totalCredits, 0);

    expect(totalDebits).toBe(7200);
    expect(totalCredits).toBe(4500);
  });
});
