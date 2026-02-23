import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────
vi.mock('@oppsera/db', () => ({
  paymentJournalEntries: {
    tenantId: 'tenant_id',
    orderId: 'order_id',
    referenceType: 'reference_type',
    referenceId: 'reference_id',
    postingStatus: 'posting_status',
  },
}));

// Drizzle operator stubs — just return the arguments for matching
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

import { generateJournalEntry } from '../helpers/gl-journal';
import type { TenderForGL, OrderForGL } from '../helpers/gl-journal';

// ── Helpers ────────────────────────────────────────────────────────
function createTender(overrides: Partial<TenderForGL> = {}): TenderForGL {
  return {
    id: 'tender-1',
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    orderId: 'order-1',
    tenderType: 'cash',
    amount: 1000, // $10.00
    tipAmount: 0,
    ...overrides,
  };
}

function createOrder(overrides: Partial<OrderForGL> = {}): OrderForGL {
  return {
    businessDate: '2026-01-15',
    subtotal: 900,
    taxTotal: 100,
    serviceChargeTotal: 0,
    discountTotal: 0,
    total: 1000,
    lines: [
      { departmentId: null, lineGross: 1000, lineTax: 100, lineNet: 900 },
    ],
    ...overrides,
  };
}

function createMockTx(previousJournals: any[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(previousJournals),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'pje-1' }]),
  };
}

function sumDebits(entries: Array<{ debit: number; credit: number }>) {
  return entries.reduce((s, e) => s + e.debit, 0);
}

function sumCredits(entries: Array<{ debit: number; credit: number }>) {
  return entries.reduce((s, e) => s + e.credit, 0);
}

describe('generateJournalEntry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Proportional method (non-final tender) ──────────────────────

  describe('proportional method (non-final tender)', () => {
    it('should use proportional allocation for partial tenders', async () => {
      const tx = createMockTx();
      const tender = createTender({ amount: 500 }); // 50% of order
      const order = createOrder({ total: 1000 });

      const result = await generateJournalEntry(tx as any, tender, order, false);

      expect(result.allocationSnapshot.method).toBe('proportional');
      expect(result.allocationSnapshot.tenderRatio).toBeCloseTo(0.5);
    });

    it('should produce balanced debits and credits', async () => {
      const tx = createMockTx();
      const tender = createTender({ amount: 500 });
      const order = createOrder({ total: 1000 });

      const { entries } = await generateJournalEntry(tx as any, tender, order, false);

      expect(sumDebits(entries)).toBe(sumCredits(entries));
    });

    it('should debit correct account for cash tender', async () => {
      const tx = createMockTx();
      const tender = createTender({ tenderType: 'cash', amount: 1000 });
      const order = createOrder();

      const { entries } = await generateJournalEntry(tx as any, tender, order, false);

      const debitEntry = entries.find(e => e.debit > 0 && e.accountCode === '1010');
      expect(debitEntry).toBeDefined();
      expect(debitEntry!.accountName).toBe('Cash on Hand');
    });

    it('should include proportional tax credit', async () => {
      const tx = createMockTx();
      const tender = createTender({ amount: 500 }); // 50%
      const order = createOrder({
        total: 1000,
        lines: [{ departmentId: null, lineGross: 1000, lineTax: 100, lineNet: 900 }],
      });

      const { entries } = await generateJournalEntry(tx as any, tender, order, false);

      const taxEntry = entries.find(e => e.accountCode === '2100');
      expect(taxEntry).toBeDefined();
      expect(taxEntry!.credit).toBe(Math.round(100 * 0.5)); // 50 cents
    });

    it('should include tip on debit side and Tips Payable credit', async () => {
      const tx = createMockTx();
      const tender = createTender({ amount: 1000, tipAmount: 200 });
      const order = createOrder();

      const { entries } = await generateJournalEntry(tx as any, tender, order, false);

      // Debit should be amount + tip
      const debitEntry = entries.find(e => e.debit > 0 && e.accountCode === '1010');
      expect(debitEntry!.debit).toBe(1200);

      // Tips Payable credit
      const tipEntry = entries.find(e => e.accountCode === '2150');
      expect(tipEntry).toBeDefined();
      expect(tipEntry!.credit).toBe(200);
    });

    it('should include proportional service charge credit', async () => {
      const tx = createMockTx();
      const tender = createTender({ amount: 500 }); // 50%
      const order = createOrder({ total: 1000, serviceChargeTotal: 200 });

      const { entries } = await generateJournalEntry(tx as any, tender, order, false);

      const chargeEntry = entries.find(e => e.accountCode === '4500');
      expect(chargeEntry).toBeDefined();
      expect(chargeEntry!.credit).toBe(Math.round(200 * 0.5)); // 100
    });

    it('should include proportional discount debit', async () => {
      const tx = createMockTx();
      const tender = createTender({ amount: 500 }); // 50%
      const order = createOrder({ total: 1000, discountTotal: 100 });

      const { entries } = await generateJournalEntry(tx as any, tender, order, false);

      const discountEntry = entries.find(e => e.accountCode === '4900');
      expect(discountEntry).toBeDefined();
      expect(discountEntry!.debit).toBe(Math.round(100 * 0.5)); // 50
    });

    it('should handle multi-line orders proportionally', async () => {
      const tx = createMockTx();
      const tender = createTender({ amount: 500 }); // 50%
      const order = createOrder({
        total: 1000,
        lines: [
          { departmentId: null, lineGross: 600, lineTax: 60, lineNet: 540 },
          { departmentId: null, lineGross: 400, lineTax: 40, lineNet: 360 },
        ],
      });

      const { entries } = await generateJournalEntry(tx as any, tender, order, false);

      // Revenue credit should be proportional sum
      const revenueEntry = entries.find(e => e.accountCode === '4000');
      expect(revenueEntry).toBeDefined();
      // (540 * 0.5) + (360 * 0.5) = 270 + 180 = 450
      expect(revenueEntry!.credit).toBe(450);
    });
  });

  // ── Remainder method (final tender) ─────────────────────────────

  describe('remainder method (final tender)', () => {
    it('should use remainder allocation for final tender', async () => {
      const tx = createMockTx([]);
      const tender = createTender({ amount: 1000 });
      const order = createOrder();

      const result = await generateJournalEntry(tx as any, tender, order, true);

      expect(result.allocationSnapshot.method).toBe('remainder');
      expect(result.allocationSnapshot.tenderRatio).toBeNull();
    });

    it('should produce balanced entries for sole tender', async () => {
      const tx = createMockTx([]);
      const tender = createTender({ amount: 1000 });
      const order = createOrder();

      const { entries } = await generateJournalEntry(tx as any, tender, order, true);

      expect(sumDebits(entries)).toBe(sumCredits(entries));
    });

    it('should post full revenue when no previous tenders', async () => {
      const tx = createMockTx([]);
      const tender = createTender({ amount: 1000 });
      const order = createOrder({
        lines: [{ departmentId: null, lineGross: 1000, lineTax: 100, lineNet: 900 }],
      });

      const { entries } = await generateJournalEntry(tx as any, tender, order, true);

      const revenueEntry = entries.find(e => e.accountCode === '4000');
      expect(revenueEntry).toBeDefined();
      expect(revenueEntry!.credit).toBe(900);
    });

    it('should post remainder after previous partial tenders', async () => {
      // Previous partial tender posted 450 revenue and 50 tax
      const previousJournals = [{
        entries: [
          { accountCode: '1010', accountName: 'Cash on Hand', debit: 500, credit: 0 },
          { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 450 },
          { accountCode: '2100', accountName: 'Sales Tax Payable', debit: 0, credit: 50 },
        ],
        postingStatus: 'posted',
      }];

      const tx = createMockTx(previousJournals);
      const tender = createTender({ amount: 500 });
      const order = createOrder({
        total: 1000,
        lines: [{ departmentId: null, lineGross: 1000, lineTax: 100, lineNet: 900 }],
      });

      const { entries } = await generateJournalEntry(tx as any, tender, order, true);

      // Remainder revenue: 900 - 450 = 450
      const revenueEntry = entries.find(e => e.accountCode === '4000');
      expect(revenueEntry).toBeDefined();
      expect(revenueEntry!.credit).toBe(450);

      // Remainder tax: 100 - 50 = 50
      const taxEntry = entries.find(e => e.accountCode === '2100');
      expect(taxEntry).toBeDefined();
      expect(taxEntry!.credit).toBe(50);
    });

    it('should post remainder service charge', async () => {
      const previousJournals = [{
        entries: [
          { accountCode: '1010', accountName: 'Cash on Hand', debit: 500, credit: 0 },
          { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 350 },
          { accountCode: '2100', accountName: 'Sales Tax Payable', debit: 0, credit: 50 },
          { accountCode: '4500', accountName: 'Service Charge Revenue', debit: 0, credit: 100 },
        ],
        postingStatus: 'posted',
      }];

      const tx = createMockTx(previousJournals);
      const tender = createTender({ amount: 500 });
      const order = createOrder({
        total: 1000,
        serviceChargeTotal: 200,
        lines: [{ departmentId: null, lineGross: 800, lineTax: 100, lineNet: 700 }],
      });

      const { entries } = await generateJournalEntry(tx as any, tender, order, true);

      const chargeEntry = entries.find(e => e.accountCode === '4500');
      expect(chargeEntry).toBeDefined();
      expect(chargeEntry!.credit).toBe(100); // 200 - 100 = 100
    });

    it('should post remainder discount', async () => {
      const previousJournals = [{
        entries: [
          { accountCode: '1010', accountName: 'Cash on Hand', debit: 500, credit: 0 },
          { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 450 },
          { accountCode: '2100', accountName: 'Sales Tax Payable', debit: 0, credit: 50 },
          { accountCode: '4900', accountName: 'Sales Discounts', debit: 25, credit: 0 },
        ],
        postingStatus: 'posted',
      }];

      const tx = createMockTx(previousJournals);
      const tender = createTender({ amount: 500 });
      const order = createOrder({
        total: 1000,
        discountTotal: 50,
        lines: [{ departmentId: null, lineGross: 1000, lineTax: 100, lineNet: 900 }],
      });

      const { entries } = await generateJournalEntry(tx as any, tender, order, true);

      const discountEntry = entries.find(e => e.accountCode === '4900');
      expect(discountEntry).toBeDefined();
      expect(discountEntry!.debit).toBe(25); // 50 - 25 = 25
    });
  });

  // ── Double-entry balancing & rounding ───────────────────────────

  describe('double-entry balancing', () => {
    it('should auto-adjust revenue for small rounding differences', async () => {
      // Create a scenario where rounding causes a 1-cent imbalance
      // tender = 333 out of 1000 -> ratio = 0.333
      // lineNet = 900, tax = 100
      // revenue = round(900 * 0.333) = 300
      // tax = round(100 * 0.333) = 33
      // debit = 333, credits = 300 + 33 = 333 — balanced in this case
      // Use a trickier split for guaranteed imbalance:
      const tx = createMockTx();
      const tender = createTender({ amount: 333 });
      const order = createOrder({
        total: 1000,
        lines: [
          { departmentId: null, lineGross: 501, lineTax: 51, lineNet: 450 },
          { departmentId: null, lineGross: 499, lineTax: 49, lineNet: 450 },
        ],
      });

      const { entries } = await generateJournalEntry(tx as any, tender, order, false);

      // Regardless of rounding, debits must equal credits
      expect(sumDebits(entries)).toBe(sumCredits(entries));
    });

    it('should store journal entry in DB', async () => {
      const tx = createMockTx();
      const tender = createTender();
      const order = createOrder();

      await generateJournalEntry(tx as any, tender, order, false);

      expect(tx.insert).toHaveBeenCalled();
      expect(tx.values).toHaveBeenCalled();
    });

    it('should return allocation snapshot with entries', async () => {
      const tx = createMockTx();
      const tender = createTender();
      const order = createOrder();

      const result = await generateJournalEntry(tx as any, tender, order, false);

      expect(result.allocationSnapshot).toBeDefined();
      expect(result.allocationSnapshot.entries).toBeDefined();
      expect(Array.isArray(result.allocationSnapshot.entries)).toBe(true);
    });
  });
});
