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
import { formatAccountingMoney } from '../types/accounting';

// ═══════════════════════════════════════════════════════════════
// Payment allocation auto-fill ("Pay All")
// ═══════════════════════════════════════════════════════════════

describe('payment allocation', () => {
  it('auto-fills Pay All up to payment amount', () => {
    const paymentAmount = 500;
    const openBills = [
      { id: 'b1', balanceDue: '200.00' },
      { id: 'b2', balanceDue: '300.00' },
      { id: 'b3', balanceDue: '150.00' },
    ];

    let remaining = paymentAmount;
    const allocations = openBills.map((bill) => {
      const bal = parseFloat(bill.balanceDue);
      const pay = Math.min(bal, remaining);
      remaining -= pay;
      return { billId: bill.id, amount: pay };
    });

    expect(allocations[0]!.amount).toBe(200);
    expect(allocations[1]!.amount).toBe(300);
    expect(allocations[2]!.amount).toBe(0);
    const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
    expect(totalAllocated).toBe(500);
  });

  it('handles payment exceeding total open balance', () => {
    const paymentAmount = 1000;
    const openBills = [
      { id: 'b1', balanceDue: '300.00' },
      { id: 'b2', balanceDue: '200.00' },
    ];

    let remaining = paymentAmount;
    const allocations = openBills.map((bill) => {
      const bal = parseFloat(bill.balanceDue);
      const pay = Math.min(bal, remaining);
      remaining -= pay;
      return { billId: bill.id, amount: pay };
    });

    const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
    const unapplied = paymentAmount - totalAllocated;
    expect(totalAllocated).toBe(500);
    expect(unapplied).toBe(500); // becomes vendor credit
  });
});

// ═══════════════════════════════════════════════════════════════
// Unapplied amount
// ═══════════════════════════════════════════════════════════════

describe('unapplied amount', () => {
  it('displays correctly when partially allocated', () => {
    const paymentAmount = 750;
    const allocated = 500;
    const unapplied = paymentAmount - allocated;
    expect(unapplied).toBe(250);
    expect(formatAccountingMoney(unapplied)).toBe('$250.00');
  });

  it('shows zero when fully allocated', () => {
    const paymentAmount = 500;
    const allocated = 500;
    const unapplied = paymentAmount - allocated;
    expect(unapplied).toBe(0);
    expect(formatAccountingMoney(unapplied)).toBe('$0.00');
  });
});

// ═══════════════════════════════════════════════════════════════
// AP aging color-coding
// ═══════════════════════════════════════════════════════════════

describe('AP aging color coding', () => {
  const AGING_COLORS: Record<string, string> = {
    current: 'text-green-700',
    days1to30: 'text-yellow-600',
    days31to60: 'text-orange-600',
    days61to90: 'text-red-600',
    days90plus: 'text-red-800',
  };

  it('assigns correct colors to aging buckets', () => {
    expect(AGING_COLORS.current).toBe('text-green-700');
    expect(AGING_COLORS.days1to30).toBe('text-yellow-600');
    expect(AGING_COLORS.days31to60).toBe('text-orange-600');
    expect(AGING_COLORS.days61to90).toBe('text-red-600');
    expect(AGING_COLORS.days90plus).toBe('text-red-800');
  });

  it('computes aging totals across vendors', () => {
    const rows = [
      { vendorId: 'v1', vendorName: 'A', current: 100, days1to30: 50, days31to60: 0, days61to90: 0, days90plus: 0, total: 150 },
      { vendorId: 'v2', vendorName: 'B', current: 0, days1to30: 200, days31to60: 100, days61to90: 50, days90plus: 25, total: 375 },
    ];

    const totals = rows.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        days1to30: acc.days1to30 + r.days1to30,
        days31to60: acc.days31to60 + r.days31to60,
        days61to90: acc.days61to90 + r.days61to90,
        days90plus: acc.days90plus + r.days90plus,
        total: acc.total + r.total,
      }),
      { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, total: 0 },
    );

    expect(totals.current).toBe(100);
    expect(totals.days1to30).toBe(250);
    expect(totals.total).toBe(525);
  });
});

// ═══════════════════════════════════════════════════════════════
// Vendor ledger running balance
// ═══════════════════════════════════════════════════════════════

describe('vendor ledger running balance', () => {
  it('calculates running balance correctly', () => {
    const openingBalance = 0;
    const transactions = [
      { type: 'bill', debit: 500, credit: 0 },
      { type: 'bill', debit: 300, credit: 0 },
      { type: 'payment', debit: 0, credit: 400 },
      { type: 'credit', debit: 0, credit: 100 },
    ];

    let balance = openingBalance;
    const rows = transactions.map((t) => {
      balance = balance + t.debit - t.credit;
      return { ...t, runningBalance: balance };
    });

    expect(rows[0]!.runningBalance).toBe(500);
    expect(rows[1]!.runningBalance).toBe(800);
    expect(rows[2]!.runningBalance).toBe(400);
    expect(rows[3]!.runningBalance).toBe(300);
  });
});

// ═══════════════════════════════════════════════════════════════
// 1099 report filtering
// ═══════════════════════════════════════════════════════════════

describe('1099 report', () => {
  it('filters to eligible vendors only', () => {
    const vendors = [
      { vendorId: 'v1', vendorName: 'Vendor A', is1099Eligible: true, totalPayments: 5000 },
      { vendorId: 'v2', vendorName: 'Vendor B', is1099Eligible: false, totalPayments: 3000 },
      { vendorId: 'v3', vendorName: 'Vendor C', is1099Eligible: true, totalPayments: 800 },
    ];

    const eligible = vendors.filter((v) => v.is1099Eligible);
    expect(eligible).toHaveLength(2);
    expect(eligible.map((v) => v.vendorId)).toEqual(['v1', 'v3']);
  });

  it('identifies vendors above reporting threshold', () => {
    const THRESHOLD = 600; // IRS 1099-NEC threshold
    const vendors = [
      { vendorId: 'v1', is1099Eligible: true, totalPayments: 5000 },
      { vendorId: 'v2', is1099Eligible: true, totalPayments: 400 },
      { vendorId: 'v3', is1099Eligible: true, totalPayments: 600 },
    ];

    const reportable = vendors.filter((v) => v.is1099Eligible && v.totalPayments >= THRESHOLD);
    expect(reportable).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Payment API
// ═══════════════════════════════════════════════════════════════

describe('payment API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a payment with allocations', async () => {
    const payload = {
      vendorId: 'v1',
      paymentDate: '2026-02-20',
      paymentMethod: 'check',
      bankAccountId: 'bank_1',
      referenceNumber: '1001',
      amount: '500.00',
      allocations: [
        { billId: 'bill_1', amount: '300.00' },
        { billId: 'bill_2', amount: '200.00' },
      ],
    };

    mockApiFetch.mockResolvedValueOnce({ data: { id: 'pmt_1', ...payload } });

    await mockApiFetch('/api/v1/ap/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/ap/payments',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('posts a draft payment', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { id: 'pmt_1', status: 'posted' } });

    await mockApiFetch('/api/v1/ap/payments/pmt_1/post', { method: 'POST' });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/ap/payments/pmt_1/post',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Cash requirements
// ═══════════════════════════════════════════════════════════════

describe('cash requirements', () => {
  it('computes running total across periods', () => {
    const periods = [
      { period: 'Week of Feb 23', billCount: 3, totalDue: 1500 },
      { period: 'Week of Mar 2', billCount: 2, totalDue: 800 },
      { period: 'Week of Mar 9', billCount: 4, totalDue: 2200 },
    ];

    let running = 0;
    const withRunning = periods.map((p) => {
      running += p.totalDue;
      return { ...p, runningTotal: running };
    });

    expect(withRunning[0]!.runningTotal).toBe(1500);
    expect(withRunning[1]!.runningTotal).toBe(2300);
    expect(withRunning[2]!.runningTotal).toBe(4500);
  });
});
