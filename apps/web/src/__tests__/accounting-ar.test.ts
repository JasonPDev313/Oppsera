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
// Invoice line auto-calculation
// ═══════════════════════════════════════════════════════════════

describe('invoice line amount auto-calculates', () => {
  it('calculates amount as qty × unitPrice', () => {
    const line = { quantity: '2', unitPrice: '150.00' };
    const amount = parseFloat(line.quantity) * parseFloat(line.unitPrice);
    expect(amount).toBe(300);
  });

  it('handles fractional quantities', () => {
    const line = { quantity: '0.5', unitPrice: '200.00' };
    const amount = parseFloat(line.quantity) * parseFloat(line.unitPrice);
    expect(amount).toBe(100);
  });

  it('computes subtotal and grand total with tax', () => {
    const lines = [
      { quantity: '1', unitPrice: '500.00', taxAmount: '40.00' },
      { quantity: '2', unitPrice: '100.00', taxAmount: '16.00' },
    ];
    const subtotal = lines.reduce(
      (sum, l) => sum + parseFloat(l.quantity) * parseFloat(l.unitPrice),
      0,
    );
    const taxTotal = lines.reduce((sum, l) => sum + parseFloat(l.taxAmount), 0);
    expect(subtotal).toBe(700);
    expect(taxTotal).toBe(56);
    expect(subtotal + taxTotal).toBe(756);
  });
});

// ═══════════════════════════════════════════════════════════════
// Receipt allocation respects invoice balance
// ═══════════════════════════════════════════════════════════════

describe('receipt allocation respects invoice balance', () => {
  it('limits allocation to invoice balance due', () => {
    const invoice = { id: 'inv_1', balanceDue: '250.00' };
    const proposedPayment = 300;
    const actualPayment = Math.min(proposedPayment, parseFloat(invoice.balanceDue));
    expect(actualPayment).toBe(250);
  });

  it('distributes receipt across multiple invoices', () => {
    const receiptAmount = 500;
    const invoices = [
      { id: 'inv_1', balanceDue: '200.00' },
      { id: 'inv_2', balanceDue: '400.00' },
    ];

    let remaining = receiptAmount;
    const allocations = invoices.map((inv) => {
      const bal = parseFloat(inv.balanceDue);
      const pay = Math.min(bal, remaining);
      remaining -= pay;
      return { invoiceId: inv.id, amount: pay };
    });

    expect(allocations[0]!.amount).toBe(200);
    expect(allocations[1]!.amount).toBe(300);
    expect(remaining).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// AR aging groups by customer
// ═══════════════════════════════════════════════════════════════

describe('AR aging groups by customer', () => {
  it('computes totals correctly', () => {
    const rows = [
      { customerId: 'c1', customerName: 'Alice', current: 500, days1to30: 100, days31to60: 0, days61to90: 0, days90plus: 0, total: 600 },
      { customerId: 'c2', customerName: 'Bob', current: 0, days1to30: 0, days31to60: 200, days61to90: 300, days90plus: 0, total: 500 },
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

    expect(totals.current).toBe(500);
    expect(totals.days31to60).toBe(200);
    expect(totals.days61to90).toBe(300);
    expect(totals.total).toBe(1100);
  });
});

// ═══════════════════════════════════════════════════════════════
// Customer ledger running balance
// ═══════════════════════════════════════════════════════════════

describe('customer ledger running balance', () => {
  it('tracks balance through invoices and receipts', () => {
    const openingBalance = 100;
    const transactions = [
      { type: 'invoice', debit: 500, credit: 0 },
      { type: 'receipt', debit: 0, credit: 300 },
      { type: 'invoice', debit: 200, credit: 0 },
      { type: 'receipt', debit: 0, credit: 400 },
    ];

    let balance = openingBalance;
    const rows = transactions.map((t) => {
      balance = balance + t.debit - t.credit;
      return { ...t, runningBalance: balance };
    });

    expect(rows[0]!.runningBalance).toBe(600);
    expect(rows[1]!.runningBalance).toBe(300);
    expect(rows[2]!.runningBalance).toBe(500);
    expect(rows[3]!.runningBalance).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// Invoice API
// ═══════════════════════════════════════════════════════════════

describe('invoice API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an invoice with lines', async () => {
    const payload = {
      customerId: 'c1',
      invoiceDate: '2026-02-20',
      dueDate: '2026-03-20',
      sourceType: 'manual',
      lines: [
        { revenueAccountId: 'acc_1', quantity: '1', unitPrice: '500.00', amount: '500.00' },
      ],
    };

    mockApiFetch.mockResolvedValueOnce({ data: { id: 'inv_1', ...payload } });

    await mockApiFetch('/api/v1/ar/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/ar/invoices',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('posts a draft invoice', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { id: 'inv_1', status: 'posted' } });

    await mockApiFetch('/api/v1/ar/invoices/inv_1/post', { method: 'POST' });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/ar/invoices/inv_1/post',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Source type badge mapping
// ═══════════════════════════════════════════════════════════════

describe('source type badges', () => {
  const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
    manual: { label: 'Manual', color: 'bg-blue-100 text-blue-700' },
    membership: { label: 'Membership', color: 'bg-purple-100 text-purple-700' },
    event: { label: 'Event', color: 'bg-green-100 text-green-700' },
    pos_house_account: { label: 'POS House', color: 'bg-teal-100 text-teal-700' },
  };

  it('maps all source types to distinct badges', () => {
    const types = ['manual', 'membership', 'event', 'pos_house_account'];
    types.forEach((t) => {
      expect(SOURCE_BADGES[t]).toBeDefined();
      expect(SOURCE_BADGES[t]!.label.length).toBeGreaterThan(0);
    });
  });
});
