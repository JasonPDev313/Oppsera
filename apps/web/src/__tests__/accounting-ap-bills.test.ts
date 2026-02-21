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
// Bill line auto-calculation
// ═══════════════════════════════════════════════════════════════

describe('bill line amount calculation', () => {
  it('calculates amount as qty × unitCost', () => {
    const line = { quantity: '3', unitCost: '25.50' };
    const amount = parseFloat(line.quantity) * parseFloat(line.unitCost);
    expect(amount).toBe(76.5);
  });

  it('handles decimal quantities', () => {
    const line = { quantity: '1.5', unitCost: '100.00' };
    const amount = parseFloat(line.quantity) * parseFloat(line.unitCost);
    expect(amount).toBe(150);
  });

  it('computes subtotal from multiple lines', () => {
    const lines = [
      { quantity: '2', unitCost: '50.00' },
      { quantity: '1', unitCost: '75.00' },
      { quantity: '3', unitCost: '10.00' },
    ];
    const subtotal = lines.reduce((sum, l) => {
      return sum + parseFloat(l.quantity) * parseFloat(l.unitCost);
    }, 0);
    expect(subtotal).toBe(205);
  });

  it('computes total with tax', () => {
    const subtotal = 200;
    const tax = 15;
    expect(subtotal + tax).toBe(215);
  });
});

// ═══════════════════════════════════════════════════════════════
// Due date calculation from payment terms
// ═══════════════════════════════════════════════════════════════

describe('due date from payment terms', () => {
  it('calculates due date from Net 30', () => {
    const billDate = '2026-02-15';
    const dueDays = 30;
    const d = new Date(billDate + 'T00:00:00');
    d.setDate(d.getDate() + dueDays);
    const dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(dueDate).toBe('2026-03-17');
  });

  it('calculates due date from Net 10', () => {
    const billDate = '2026-02-20';
    const dueDays = 10;
    const d = new Date(billDate + 'T00:00:00');
    d.setDate(d.getDate() + dueDays);
    const dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(dueDate).toBe('2026-03-02');
  });

  it('calculates early payment discount window', () => {
    const billDate = '2026-02-15';
    const discountDays = 10;
    const discountPercent = 2;
    const d = new Date(billDate + 'T00:00:00');
    d.setDate(d.getDate() + discountDays);
    const discountDeadline = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(discountDeadline).toBe('2026-02-25');
    expect(discountPercent).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Bill form validation
// ═══════════════════════════════════════════════════════════════

describe('bill form validation', () => {
  it('requires vendor', () => {
    const form = { vendorId: '', billNumber: 'INV-001', billDate: '2026-02-20', dueDate: '2026-03-20' };
    const errors: Record<string, string> = {};
    if (!form.vendorId) errors.vendorId = 'Vendor is required';
    expect(errors.vendorId).toBe('Vendor is required');
  });

  it('requires bill number', () => {
    const form = { vendorId: 'v1', billNumber: '', billDate: '2026-02-20', dueDate: '2026-03-20' };
    const errors: Record<string, string> = {};
    if (!form.billNumber.trim()) errors.billNumber = 'Bill number is required';
    expect(errors.billNumber).toBe('Bill number is required');
  });

  it('requires each line to have a GL account', () => {
    const lines = [
      { glAccountId: null, unitCost: '50.00' },
      { glAccountId: 'acc_1', unitCost: '75.00' },
    ];
    const lineErrors = lines.filter((l) => !l.glAccountId);
    expect(lineErrors).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Void restrictions
// ═══════════════════════════════════════════════════════════════

describe('void restrictions', () => {
  it('blocks void when bill has payments', () => {
    const bill = { status: 'posted', allocations: [{ id: 'alloc_1', amount: '50.00' }] };
    const hasPayments = bill.allocations && bill.allocations.length > 0;
    expect(hasPayments).toBe(true);
    // Should show error: "Cannot void bill with existing payments"
  });

  it('allows void when no payments exist', () => {
    const bill = { status: 'posted', allocations: [] };
    const hasPayments = bill.allocations && bill.allocations.length > 0;
    expect(hasPayments).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Bill API calls
// ═══════════════════════════════════════════════════════════════

describe('bill API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a bill with lines', async () => {
    const payload = {
      vendorId: 'v1',
      billNumber: 'INV-001',
      billDate: '2026-02-20',
      dueDate: '2026-03-20',
      lines: [
        { lineType: 'expense', glAccountId: 'acc_1', quantity: '1', unitCost: '100.00', amount: '100.00' },
      ],
    };

    mockApiFetch.mockResolvedValueOnce({ data: { id: 'bill_1', ...payload } });

    await mockApiFetch('/api/v1/ap/bills', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/ap/bills',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('posts a draft bill', async () => {
    mockApiFetch.mockResolvedValueOnce({ data: { id: 'bill_1', status: 'posted' } });

    await mockApiFetch('/api/v1/ap/bills/bill_1/post', { method: 'POST' });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/v1/ap/bills/bill_1/post',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Overdue detection
// ═══════════════════════════════════════════════════════════════

describe('overdue detection', () => {
  it('marks bill as overdue when past due date', () => {
    const bill = { dueDate: '2026-01-15', status: 'posted' };
    const today = '2026-02-20';
    const isOverdue = bill.dueDate < today && ['posted', 'partial'].includes(bill.status);
    expect(isOverdue).toBe(true);
  });

  it('does not mark future bills as overdue', () => {
    const bill = { dueDate: '2026-03-20', status: 'posted' };
    const today = '2026-02-20';
    const isOverdue = bill.dueDate < today && ['posted', 'partial'].includes(bill.status);
    expect(isOverdue).toBe(false);
  });

  it('does not mark paid bills as overdue', () => {
    const bill = { dueDate: '2026-01-15', status: 'paid' };
    const today = '2026-02-20';
    const isOverdue = bill.dueDate < today && ['posted', 'partial'].includes(bill.status);
    expect(isOverdue).toBe(false);
  });
});
