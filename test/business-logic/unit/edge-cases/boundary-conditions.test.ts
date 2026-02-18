/**
 * Phase 4 — Boundary Condition Tests
 *
 * Tests boundary values, empty inputs, and limit conditions
 * for the order calculation pipeline.
 * Pure unit test — no database required.
 */

import { recalculateOrderTotals } from '@oppsera/module-orders/helpers/order-totals';

describe('Boundary Conditions', () => {
  // ── Empty Inputs ──

  describe('Empty Inputs', () => {
    it('no lines, no charges, no discounts = all zeros', () => {
      const result = recalculateOrderTotals([], [], []);
      expect(result.subtotal).toBe(0);
      expect(result.taxTotal).toBe(0);
      expect(result.serviceChargeTotal).toBe(0);
      expect(result.discountTotal).toBe(0);
      expect(result.total).toBe(0);
    });

    it('only discount, no lines = total clamped to 0', () => {
      const result = recalculateOrderTotals([], [], [{ amount: 500 }]);
      expect(result.total).toBe(0);
      expect(result.discountTotal).toBe(500);
    });

    it('only service charge, no lines', () => {
      const result = recalculateOrderTotals(
        [],
        [{ amount: 300, taxAmount: 0 }],
        [],
      );
      expect(result.subtotal).toBe(0);
      expect(result.serviceChargeTotal).toBe(300);
      expect(result.total).toBe(300);
    });
  });

  // ── Single-Item Extremes ──

  describe('Single-Item Extremes', () => {
    it('$0.01 item with $0.00 tax', () => {
      const result = recalculateOrderTotals(
        [{ lineSubtotal: 1, lineTax: 0, lineTotal: 1 }],
        [],
        [],
      );
      expect(result.subtotal).toBe(1);
      expect(result.total).toBe(1);
    });

    it('$9,999.99 item with tax', () => {
      // 99999 * 0.085 = 8499.915 → 8500
      const result = recalculateOrderTotals(
        [{ lineSubtotal: 99999, lineTax: 8500, lineTotal: 108499 }],
        [],
        [],
      );
      expect(result.subtotal).toBe(99999);
      expect(result.taxTotal).toBe(8500);
      expect(result.total).toBe(108499);
    });

    it('zero-price item (free)', () => {
      const result = recalculateOrderTotals(
        [{ lineSubtotal: 0, lineTax: 0, lineTotal: 0 }],
        [],
        [],
      );
      expect(result.subtotal).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  // ── Many Items ──

  describe('Many Items', () => {
    it('100 items at $0.01 each', () => {
      const lines = Array.from({ length: 100 }, () => ({
        lineSubtotal: 1, lineTax: 0, lineTotal: 1,
      }));
      const result = recalculateOrderTotals(lines, [], []);
      expect(result.subtotal).toBe(100);
      expect(result.total).toBe(100);
    });

    it('1000 items at $9.99 each', () => {
      const lines = Array.from({ length: 1000 }, () => ({
        lineSubtotal: 999, lineTax: 85, lineTotal: 1084,
      }));
      const result = recalculateOrderTotals(lines, [], []);
      expect(result.subtotal).toBe(999000);
      expect(result.taxTotal).toBe(85000);
      expect(result.total).toBe(1084000);
    });
  });

  // ── Multiple Discounts ──

  describe('Multiple Discounts', () => {
    it('10 stacked discounts', () => {
      const lines = [{ lineSubtotal: 10000, lineTax: 0, lineTotal: 10000 }];
      const discounts = Array.from({ length: 10 }, () => ({ amount: 100 }));
      const result = recalculateOrderTotals(lines, [], discounts);
      expect(result.discountTotal).toBe(1000); // 10 × $1.00
      expect(result.total).toBe(9000); // $100 - $10 = $90
    });

    it('discounts exceeding total clamp to 0', () => {
      const lines = [{ lineSubtotal: 100, lineTax: 0, lineTotal: 100 }];
      const discounts = Array.from({ length: 10 }, () => ({ amount: 100 }));
      const result = recalculateOrderTotals(lines, [], discounts);
      expect(result.discountTotal).toBe(1000);
      expect(result.total).toBe(0); // Clamped
    });
  });

  // ── Multiple Service Charges ──

  describe('Multiple Service Charges', () => {
    it('two service charges stack', () => {
      const result = recalculateOrderTotals(
        [{ lineSubtotal: 5000, lineTax: 425, lineTotal: 5425 }],
        [
          { amount: 900, taxAmount: 0 },
          { amount: 250, taxAmount: 0 },
        ],
        [],
      );
      expect(result.serviceChargeTotal).toBe(1150); // 900 + 250
      expect(result.total).toBe(6575); // 5425 + 1150
    });

    it('taxable + non-taxable charges combine correctly', () => {
      const result = recalculateOrderTotals(
        [{ lineSubtotal: 5000, lineTax: 425, lineTotal: 5425 }],
        [
          { amount: 900, taxAmount: 77 },   // Taxable
          { amount: 250, taxAmount: 0 },     // Non-taxable
        ],
        [],
      );
      expect(result.serviceChargeTotal).toBe(1150);
      expect(result.taxTotal).toBe(502); // 425 + 77
      expect(result.total).toBe(6652); // 5425 + 900 + 77 + 250
    });
  });

  // ── Rounding Adjustment Boundaries ──

  describe('Rounding Adjustment', () => {
    it('rounding = 0 is default', () => {
      const result = recalculateOrderTotals(
        [{ lineSubtotal: 100, lineTax: 0, lineTotal: 100 }],
        [],
        [],
      );
      expect(result.roundingAdjustment).toBe(0);
    });

    it('+2 cent rounding', () => {
      const result = recalculateOrderTotals(
        [{ lineSubtotal: 100, lineTax: 0, lineTotal: 100 }],
        [],
        [],
        2,
      );
      expect(result.roundingAdjustment).toBe(2);
      expect(result.total).toBe(102);
    });

    it('-2 cent rounding', () => {
      const result = recalculateOrderTotals(
        [{ lineSubtotal: 100, lineTax: 0, lineTotal: 100 }],
        [],
        [],
        -2,
      );
      expect(result.roundingAdjustment).toBe(-2);
      expect(result.total).toBe(98);
    });

    it('rounding that would make total negative clamps to 0', () => {
      const result = recalculateOrderTotals(
        [{ lineSubtotal: 1, lineTax: 0, lineTotal: 1 }],
        [],
        [],
        -5,
      );
      expect(result.total).toBe(0);
    });
  });

  // ── Combined Extremes ──

  describe('Combined Extremes', () => {
    it('all components present: lines + charges + discounts + rounding', () => {
      const result = recalculateOrderTotals(
        [
          { lineSubtotal: 999, lineTax: 85, lineTotal: 1084 },
          { lineSubtotal: 1499, lineTax: 127, lineTotal: 1626 },
        ],
        [{ amount: 450, taxAmount: 38 }],
        [{ amount: 200 }],
        1,
      );

      expect(result.subtotal).toBe(2498);
      expect(result.taxTotal).toBe(250); // 85 + 127 + 38
      expect(result.serviceChargeTotal).toBe(450);
      expect(result.discountTotal).toBe(200);
      expect(result.roundingAdjustment).toBe(1);
      // total = (1084 + 1626) + 450 + 38 - 200 + 1 = 2999
      expect(result.total).toBe(2999);
    });
  });

  // ── INVARIANTS Across All Tests ──

  describe('Global Invariants', () => {
    it('INVARIANT: total is always non-negative', () => {
      const extremeCases = [
        { lines: [], charges: [], discounts: [{ amount: 99999 }] },
        { lines: [{ lineSubtotal: 1, lineTax: 0, lineTotal: 1 }], charges: [], discounts: [{ amount: 99999 }] },
        {
          lines: [{ lineSubtotal: 100, lineTax: 0, lineTotal: 100 }],
          charges: [],
          discounts: Array.from({ length: 100 }, () => ({ amount: 100 })),
        },
      ];

      for (const tc of extremeCases) {
        const result = recalculateOrderTotals(
          tc.lines,
          tc.charges.map((c) => ({ ...c, taxAmount: 0 })),
          tc.discounts,
        );
        expect(result.total).toBeGreaterThanOrEqual(0);
      }
    });

    it('INVARIANT: subtotal = sum(lineSubtotal)', () => {
      for (let n = 0; n <= 50; n++) {
        const lines = Array.from({ length: n }, (_, i) => ({
          lineSubtotal: 100 + i,
          lineTax: 0,
          lineTotal: 100 + i,
        }));
        const result = recalculateOrderTotals(lines, [], []);
        const expected = lines.reduce((s, l) => s + l.lineSubtotal, 0);
        expect(result.subtotal).toBe(expected);
      }
    });
  });
});
