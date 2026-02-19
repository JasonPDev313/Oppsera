/**
 * Phase 1B — Tax Calculations (Pure Unit Tests)
 *
 * Tests calculateTaxes() with exact cent-level precision.
 * Covers exclusive, inclusive, multi-rate, zero-rate, and rounding.
 */

import { calculateTaxes } from '@oppsera/core/helpers/tax-calc';
import type { TaxCalculationInput } from '@oppsera/core/helpers/tax-calc';

describe('Tax Calculations', () => {
  // ── Exclusive Mode (tax added on top) ──

  describe('Exclusive Mode', () => {
    it('calculates single rate: $10.00 at 8.5%', () => {
      const result = calculateTaxes({
        lineSubtotal: 1000, // $10.00
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'rate1', taxName: 'Sales Tax', rateDecimal: 0.085 }],
      });
      expect(result.taxTotal).toBe(85);    // round(1000 * 0.085) = 85
      expect(result.total).toBe(1085);     // 1000 + 85
      expect(result.subtotal).toBe(1000);  // unchanged
    });

    it('calculates $9.99 at 8.5% (rounding test)', () => {
      const result = calculateTaxes({
        lineSubtotal: 999,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'rate1', taxName: 'Tax', rateDecimal: 0.085 }],
      });
      // 999 * 0.085 = 84.915 → rounds to 85
      expect(result.taxTotal).toBe(85);
      expect(result.total).toBe(1084);
    });

    it('calculates $0.01 at 8.5% (minimum price)', () => {
      const result = calculateTaxes({
        lineSubtotal: 1,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'rate1', taxName: 'Tax', rateDecimal: 0.085 }],
      });
      // 1 * 0.085 = 0.085 → rounds to 0
      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(1);
    });

    it('calculates $0.99 at 8.5%', () => {
      const result = calculateTaxes({
        lineSubtotal: 99,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'rate1', taxName: 'Tax', rateDecimal: 0.085 }],
      });
      // 99 * 0.085 = 8.415 → rounds to 8
      expect(result.taxTotal).toBe(8);
      expect(result.total).toBe(107);
    });

    it('calculates $999.99 at 8.5% (large order)', () => {
      const result = calculateTaxes({
        lineSubtotal: 99999,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'rate1', taxName: 'Tax', rateDecimal: 0.085 }],
      });
      // 99999 * 0.085 = 8499.915 → rounds to 8500
      expect(result.taxTotal).toBe(8500);
      expect(result.total).toBe(108499);
    });

    it('handles 0% tax rate', () => {
      const result = calculateTaxes({
        lineSubtotal: 1000,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'rate1', taxName: 'Zero Tax', rateDecimal: 0 }],
      });
      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(1000);
    });

    it('handles no tax rates (tax-exempt item)', () => {
      const result = calculateTaxes({
        lineSubtotal: 1000,
        calculationMode: 'exclusive',
        taxRates: [],
      });
      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(1000);
      expect(result.breakdown).toHaveLength(0);
    });
  });

  // ── Inclusive Mode (tax already in price) ──

  describe('Inclusive Mode', () => {
    it('extracts tax from $10.85 at 8.5%', () => {
      const result = calculateTaxes({
        lineSubtotal: 1085, // price already includes tax
        calculationMode: 'inclusive',
        taxRates: [{ taxRateId: 'rate1', taxName: 'Tax', rateDecimal: 0.085 }],
      });
      // taxTotal = round(1085 - 1085 / 1.085) = round(1085 - 1000) = 85
      expect(result.taxTotal).toBe(85);
      expect(result.subtotal).toBe(1000); // pre-tax amount
      expect(result.total).toBe(1085);     // unchanged — price already includes tax
    });

    it('extracts tax from $10.00 at 8.5%', () => {
      const result = calculateTaxes({
        lineSubtotal: 1000,
        calculationMode: 'inclusive',
        taxRates: [{ taxRateId: 'rate1', taxName: 'Tax', rateDecimal: 0.085 }],
      });
      // taxTotal = round(1000 - 1000 / 1.085) = round(1000 - 921.658...) = round(78.341...) = 78
      expect(result.taxTotal).toBe(78);
      expect(result.subtotal).toBe(922); // 1000 - 78
      expect(result.total).toBe(1000);    // unchanged
    });
  });

  // ── Multiple Tax Rates ──

  describe('Multiple Tax Rates', () => {
    it('combines state 6% + county 1.5% exclusive', () => {
      const result = calculateTaxes({
        lineSubtotal: 1000,
        calculationMode: 'exclusive',
        taxRates: [
          { taxRateId: 'state', taxName: 'State Tax', rateDecimal: 0.06 },
          { taxRateId: 'county', taxName: 'County Tax', rateDecimal: 0.015 },
        ],
      });
      // total rate = 0.075
      // taxTotal = round(1000 * 0.075) = 75
      expect(result.taxTotal).toBe(75);
      expect(result.total).toBe(1075);

      // Breakdown: proportional allocation
      expect(result.breakdown).toHaveLength(2);
      // State: round(75 * 0.06/0.075) = round(60) = 60
      expect(result.breakdown[0]!.amount).toBe(60);
      expect(result.breakdown[0]!.taxName).toBe('State Tax');
      // County: 75 - 60 = 15 (remainder)
      expect(result.breakdown[1]!.amount).toBe(15);
      expect(result.breakdown[1]!.taxName).toBe('County Tax');
    });

    it('INVARIANT: sum(breakdown) = taxTotal for multi-rate', () => {
      const result = calculateTaxes({
        lineSubtotal: 999,
        calculationMode: 'exclusive',
        taxRates: [
          { taxRateId: 'a', taxName: 'Tax A', rateDecimal: 0.06 },
          { taxRateId: 'b', taxName: 'Tax B', rateDecimal: 0.015 },
          { taxRateId: 'c', taxName: 'Tax C', rateDecimal: 0.005 },
        ],
      });
      const breakdownSum = result.breakdown.reduce((s, b) => s + b.amount, 0);
      expect(breakdownSum).toBe(result.taxTotal);
    });

    it('handles triple tax rate on fractional cents', () => {
      // $0.33 with 3 rates — stress test rounding
      const result = calculateTaxes({
        lineSubtotal: 33,
        calculationMode: 'exclusive',
        taxRates: [
          { taxRateId: 'a', taxName: 'State', rateDecimal: 0.06 },
          { taxRateId: 'b', taxName: 'County', rateDecimal: 0.015 },
          { taxRateId: 'c', taxName: 'City', rateDecimal: 0.005 },
        ],
      });
      // total rate = 0.08
      // taxTotal = round(33 * 0.08) = round(2.64) = 3
      expect(result.taxTotal).toBe(3);

      // Verify breakdown sums correctly
      const breakdownSum = result.breakdown.reduce((s, b) => s + b.amount, 0);
      expect(breakdownSum).toBe(3);
    });
  });

  // ── Rounding Stress Tests ──

  describe('Rounding', () => {
    it('$9.99 × 10% = 100 (rounds up from 99.9)', () => {
      const result = calculateTaxes({
        lineSubtotal: 999,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: 0.1 }],
      });
      // 999 * 0.1 = 99.9 → rounds to 100
      expect(result.taxTotal).toBe(100);
    });

    it('$1.01 × 7.5% = 8 (rounds up from 7.575)', () => {
      const result = calculateTaxes({
        lineSubtotal: 101,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: 0.075 }],
      });
      // 101 * 0.075 = 7.575 → rounds to 8
      expect(result.taxTotal).toBe(8);
    });

    it('100 items at $0.33 with 7.5% — accumulation test', () => {
      // Each: round(33 * 0.075) = round(2.475) = 2
      // Sum of 100: 200
      // But total-first: round(3300 * 0.075) = round(247.5) = 248
      // Per-line rounding loses 48 cents vs. order-level.
      // OppsEra uses PER-LINE calculation (tax calculated when line added).

      // Verify per-line approach
      let perLineTaxSum = 0;
      for (let i = 0; i < 100; i++) {
        const r = calculateTaxes({
          lineSubtotal: 33,
          calculationMode: 'exclusive',
          taxRates: [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: 0.075 }],
        });
        perLineTaxSum += r.taxTotal;
      }

      // [ASSUMED] OppsEra uses per-line tax: each line's tax is round(33 * 0.075) = 2
      // Total per-line tax: 200 (not 248)
      expect(perLineTaxSum).toBe(200);

      // Order-level calculation would give 248
      const orderLevel = calculateTaxes({
        lineSubtotal: 3300,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: 0.075 }],
      });
      expect(orderLevel.taxTotal).toBe(248);

      // Document: per-line rounding produces $2.00 tax, order-level would produce $2.48
      // Difference: 48 cents over 100 items
      expect(perLineTaxSum).not.toBe(orderLevel.taxTotal);
    });
  });

  // ── INVARIANTS ──

  describe('Invariants', () => {
    it('INVARIANT: exclusive — total = subtotal + taxTotal', () => {
      const amounts = [1, 33, 99, 100, 999, 1000, 9999, 99999];
      const rates = [0, 0.01, 0.05, 0.075, 0.085, 0.10, 0.25];

      for (const amount of amounts) {
        for (const rate of rates) {
          const result = calculateTaxes({
            lineSubtotal: amount,
            calculationMode: 'exclusive',
            taxRates: rate > 0 ? [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: rate }] : [],
          });
          expect(result.total).toBe(result.subtotal + result.taxTotal);
        }
      }
    });

    it('INVARIANT: inclusive — total = lineSubtotal (unchanged)', () => {
      const amounts = [1, 33, 99, 100, 999, 1000, 9999];
      for (const amount of amounts) {
        const result = calculateTaxes({
          lineSubtotal: amount,
          calculationMode: 'inclusive',
          taxRates: [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: 0.085 }],
        });
        expect(result.total).toBe(amount); // Price already includes tax
        expect(result.subtotal + result.taxTotal).toBe(amount);
      }
    });

    it('INVARIANT: taxTotal >= 0 always', () => {
      const result = calculateTaxes({
        lineSubtotal: 0,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: 0.085 }],
      });
      expect(result.taxTotal).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Requirements Scenarios ──────────────────────────────────────
  // Covers the exact scenarios from the tax-inclusive pricing requirements.

  describe('Requirements Scenarios', () => {
    it('Scenario 1: Basic inclusive — $100.00 at 10%', () => {
      const result = calculateTaxes({
        lineSubtotal: 10000,
        calculationMode: 'inclusive',
        taxRates: [{ taxRateId: 'r', taxName: 'Sales Tax', rateDecimal: 0.10 }],
      });
      // taxTotal = round(10000 - 10000/1.10) = round(10000 - 9090.909...) = round(909.09...) = 909
      expect(result.taxTotal).toBe(909);
      expect(result.subtotal).toBe(9091);  // base price = 10000 - 909
      expect(result.total).toBe(10000);     // customer pays entered price
      expect(result.subtotal + result.taxTotal).toBe(result.total);
    });

    it('Scenario 2: Basic exclusive — $100.00 at 10%', () => {
      const result = calculateTaxes({
        lineSubtotal: 10000,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'r', taxName: 'Sales Tax', rateDecimal: 0.10 }],
      });
      expect(result.subtotal).toBe(10000);  // unchanged
      expect(result.taxTotal).toBe(1000);    // 10000 * 0.10
      expect(result.total).toBe(11000);      // customer pays 10000 + 1000
    });

    it('Scenario 3: Compound tax (8% + 2%) inclusive — $100.00', () => {
      const result = calculateTaxes({
        lineSubtotal: 10000,
        calculationMode: 'inclusive',
        taxRates: [
          { taxRateId: 'state', taxName: 'State Tax', rateDecimal: 0.08 },
          { taxRateId: 'local', taxName: 'Local Tax', rateDecimal: 0.02 },
        ],
      });
      // Combined rate = 0.10, same as Scenario 1
      expect(result.taxTotal).toBe(909);
      expect(result.subtotal).toBe(9091);
      expect(result.total).toBe(10000);

      // Breakdown: proportional allocation
      // State share: round(909 * 0.08/0.10) = round(727.2) = 727
      expect(result.breakdown[0]!.taxName).toBe('State Tax');
      expect(result.breakdown[0]!.amount).toBe(727);
      // Local: 909 - 727 = 182 (remainder)
      expect(result.breakdown[1]!.taxName).toBe('Local Tax');
      expect(result.breakdown[1]!.amount).toBe(182);
      // Sum must match
      expect(result.breakdown[0]!.amount + result.breakdown[1]!.amount).toBe(result.taxTotal);
    });

    it('Scenario 4: Zero price — $0.00 at 10%', () => {
      const resultInclusive = calculateTaxes({
        lineSubtotal: 0,
        calculationMode: 'inclusive',
        taxRates: [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: 0.10 }],
      });
      expect(resultInclusive.subtotal).toBe(0);
      expect(resultInclusive.taxTotal).toBe(0);
      expect(resultInclusive.total).toBe(0);

      const resultExclusive = calculateTaxes({
        lineSubtotal: 0,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: 0.10 }],
      });
      expect(resultExclusive.subtotal).toBe(0);
      expect(resultExclusive.taxTotal).toBe(0);
      expect(resultExclusive.total).toBe(0);
    });

    it('Scenario 5: Rounding edge — $9.99 at 7% inclusive', () => {
      const result = calculateTaxes({
        lineSubtotal: 999,
        calculationMode: 'inclusive',
        taxRates: [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: 0.07 }],
      });
      // taxTotal = round(999 - 999/1.07) = round(999 - 933.6449...) = round(65.355...) = 65
      expect(result.taxTotal).toBe(65);
      expect(result.subtotal).toBe(934);   // 999 - 65
      expect(result.total).toBe(999);       // unchanged
      expect(result.subtotal + result.taxTotal).toBe(result.total);
    });

    it('Scenario 6: Cart 3×$3.33 inclusive at 10% — per-line rounding', () => {
      // Each line: $3.33 inclusive at 10%
      // Per line: taxTotal = round(333 - 333/1.10) = round(333 - 302.727...) = round(30.272...) = 30
      // Per line: subtotal = 333 - 30 = 303
      const lines = [];
      for (let i = 0; i < 3; i++) {
        lines.push(calculateTaxes({
          lineSubtotal: 333,
          calculationMode: 'inclusive',
          taxRates: [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: 0.10 }],
        }));
      }

      const totalTax = lines.reduce((s, l) => s + l.taxTotal, 0);
      const totalSubtotal = lines.reduce((s, l) => s + l.subtotal, 0);
      const totalCustomerPays = lines.reduce((s, l) => s + l.total, 0);

      expect(totalTax).toBe(90);           // 3 × 30
      expect(totalSubtotal).toBe(909);     // 3 × 303
      expect(totalCustomerPays).toBe(999); // 3 × 333

      // Per-line invariant holds for the cart
      expect(totalSubtotal + totalTax).toBe(totalCustomerPays);
    });

    it('Scenario 7: INVARIANT sweep — total = subtotal + taxTotal (both modes)', () => {
      const amounts = [1, 33, 50, 99, 100, 333, 500, 999, 1000, 1500, 5000, 9999, 10000, 99999];
      const rates = [0.01, 0.05, 0.07, 0.075, 0.085, 0.10, 0.13, 0.20, 0.25];
      const modes: Array<'exclusive' | 'inclusive'> = ['exclusive', 'inclusive'];

      for (const mode of modes) {
        for (const amount of amounts) {
          for (const rate of rates) {
            const result = calculateTaxes({
              lineSubtotal: amount,
              calculationMode: mode,
              taxRates: [{ taxRateId: 'r', taxName: 'Tax', rateDecimal: rate }],
            });

            // Core invariant: total = subtotal + taxTotal
            expect(result.subtotal + result.taxTotal).toBe(result.total);

            // Mode-specific invariants
            if (mode === 'inclusive') {
              expect(result.total).toBe(amount); // customer pays entered price
            } else {
              expect(result.subtotal).toBe(amount); // subtotal = entered price
            }

            // Non-negative
            expect(result.taxTotal).toBeGreaterThanOrEqual(0);
            expect(result.subtotal).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });

    it('Scenario 7b: INVARIANT sweep — multi-rate breakdown sums to taxTotal', () => {
      const amounts = [33, 100, 333, 999, 5000, 10000];
      const modes: Array<'exclusive' | 'inclusive'> = ['exclusive', 'inclusive'];

      for (const mode of modes) {
        for (const amount of amounts) {
          const result = calculateTaxes({
            lineSubtotal: amount,
            calculationMode: mode,
            taxRates: [
              { taxRateId: 'a', taxName: 'State', rateDecimal: 0.06 },
              { taxRateId: 'b', taxName: 'County', rateDecimal: 0.015 },
              { taxRateId: 'c', taxName: 'City', rateDecimal: 0.005 },
            ],
          });
          const breakdownSum = result.breakdown.reduce((s, b) => s + b.amount, 0);
          expect(breakdownSum).toBe(result.taxTotal);
        }
      }
    });

    // Phase 2 — line-level discount → tax recalculation
    it.todo('Scenario: Discount applied to base, tax recomputed on discounted base (requires line-level discounts)');

    // Phase 2 — floor price enforcement
    it.todo('Scenario: Floor price prevents selling below minimum (requires floorPrice column on catalog_items)');
  });
});
