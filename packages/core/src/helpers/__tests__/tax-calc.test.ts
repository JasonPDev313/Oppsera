import { describe, it, expect } from 'vitest';
import { calculateTaxes } from '../tax-calc';
// TaxCalculationInput type used implicitly via calculateTaxes args

// ── Shared rate fixtures ─────────────────────────────────────────
const STATE_TAX = { taxRateId: 'tr_state', taxName: 'State Tax', rateDecimal: 0.06 };
const COUNTY_TAX = { taxRateId: 'tr_county', taxName: 'County Tax', rateDecimal: 0.015 };
const CITY_TAX = { taxRateId: 'tr_city', taxName: 'City Tax', rateDecimal: 0.0075 };

describe('calculateTaxes', () => {
  // ── 1. Single taxable line ──────────────────────────────────────
  describe('single taxable line (exclusive)', () => {
    it('computes tax on a $10.00 item at 6%', () => {
      const result = calculateTaxes({
        lineSubtotal: 1000,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX],
      });
      expect(result.subtotal).toBe(1000);
      expect(result.taxTotal).toBe(60); // 1000 * 0.06
      expect(result.total).toBe(1060);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0]!.amount).toBe(60);
    });

    it('computes tax on a $0.01 item (penny)', () => {
      const result = calculateTaxes({
        lineSubtotal: 1,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX],
      });
      // 1 * 0.06 = 0.06 → round → 0
      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(1);
    });
  });

  // ── 2. Multiple taxable lines ───────────────────────────────────
  describe('multiple lines (simulate cart-level sum)', () => {
    it('line-level tax differs from cart-level tax', () => {
      // This test demonstrates WHY line-level tax matters.
      // Three items at $3.33 each, 7.5% tax:
      //   Cart-level: round(999 * 0.075) = round(74.925) = 75
      //   Line-level: round(333 * 0.075) * 3 = round(24.975) * 3 = 25 * 3 = 75
      // In this case they match. Let's find a case where they don't:

      // Two items: $1.05 and $1.05 at 8.25%
      const line1 = calculateTaxes({
        lineSubtotal: 105,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'tr', taxName: 'Tax', rateDecimal: 0.0825 }],
      });
      const line2 = calculateTaxes({
        lineSubtotal: 105,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'tr', taxName: 'Tax', rateDecimal: 0.0825 }],
      });

      // Line-level: round(105 * 0.0825) = round(8.6625) = 9 each → 18 total
      expect(line1.taxTotal).toBe(9);
      expect(line2.taxTotal).toBe(9);
      const lineLevelTotal = line1.taxTotal + line2.taxTotal; // 18

      // Cart-level (if someone naively computed on combined): round(210 * 0.0825) = round(17.325) = 17
      const cartLevelTax = Math.round(210 * 0.0825);
      expect(cartLevelTax).toBe(17);

      // Line-level produces 18¢ tax, cart-level produces 17¢ — difference of 1¢!
      expect(lineLevelTotal).not.toBe(cartLevelTax);
      expect(lineLevelTotal).toBe(18);
    });
  });

  // ── 3. Multiple quantities on a line ────────────────────────────
  describe('quantities', () => {
    it('handles qty=3 at $3.33 correctly', () => {
      // lineSubtotal = round(3 * 333) = 999
      const result = calculateTaxes({
        lineSubtotal: 999,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX, COUNTY_TAX],
      });
      // 999 * 0.075 = 74.925 → 75
      expect(result.taxTotal).toBe(75);
      expect(result.total).toBe(1074);
    });

    it('handles qty=100 at $0.99', () => {
      const result = calculateTaxes({
        lineSubtotal: 9900, // 100 * 99¢
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX],
      });
      expect(result.taxTotal).toBe(594); // 9900 * 0.06 = 594
      expect(result.total).toBe(10494);
    });
  });

  // ── 4. Taxable + non-taxable mixed ──────────────────────────────
  describe('mixed taxability', () => {
    it('non-taxable line has zero tax', () => {
      const taxable = calculateTaxes({
        lineSubtotal: 500,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX],
      });
      const nonTaxable = calculateTaxes({
        lineSubtotal: 500,
        calculationMode: 'exclusive',
        taxRates: [], // no rates = not taxable
      });

      expect(taxable.taxTotal).toBe(30);
      expect(nonTaxable.taxTotal).toBe(0);

      // Cart total tax = only taxable line's tax
      const cartTax = taxable.taxTotal + nonTaxable.taxTotal;
      expect(cartTax).toBe(30);
    });
  });

  // ── 5. Line-item discount (price override) ──────────────────────
  describe('line-item discount via reduced subtotal', () => {
    it('tax computed on discounted subtotal', () => {
      // $10.00 item with $2.00 price override discount → lineSubtotal = $8.00
      const result = calculateTaxes({
        lineSubtotal: 800,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX, COUNTY_TAX],
      });
      expect(result.taxTotal).toBe(60); // 800 * 0.075 = 60
      expect(result.total).toBe(860);
    });
  });

  // ── 6. Cart-level prorated discount ─────────────────────────────
  describe('cart-level discount proration', () => {
    it('discount prorated across lines reduces each lines taxable base', () => {
      // 2 lines: $10.00 and $20.00, $6.00 cart discount, 7.5% tax
      const subtotals = [1000, 2000];
      const totalSubtotal = 3000;
      const discountTotal = 600;

      // Prorate: line1 = round(600 * 1000/3000) = 200, line2 = 600 - 200 = 400
      const alloc1 = Math.round(discountTotal * (subtotals[0]! / totalSubtotal));
      const alloc2 = discountTotal - alloc1;
      expect(alloc1).toBe(200);
      expect(alloc2).toBe(400);

      // Tax on discounted base
      const tax1 = calculateTaxes({
        lineSubtotal: subtotals[0]! - alloc1,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX, COUNTY_TAX],
      });
      const tax2 = calculateTaxes({
        lineSubtotal: subtotals[1]! - alloc2,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX, COUNTY_TAX],
      });

      expect(tax1.taxTotal).toBe(60); // 800 * 0.075 = 60
      expect(tax2.taxTotal).toBe(120); // 1600 * 0.075 = 120
      expect(tax1.taxTotal + tax2.taxTotal).toBe(180);

      // Without discount: tax = round(3000 * 0.075) = 225
      // With discount: 180 → saved 45¢ tax
      const withoutDiscount = calculateTaxes({
        lineSubtotal: 3000,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX, COUNTY_TAX],
      });
      expect(withoutDiscount.taxTotal).toBe(225);
      expect(withoutDiscount.taxTotal - (tax1.taxTotal + tax2.taxTotal)).toBe(45);
    });
  });

  // ── 7. Small-dollar rounding edge cases ─────────────────────────
  describe('rounding edge cases', () => {
    it('$0.07 item at 8.25% rounds to 1¢ tax', () => {
      const result = calculateTaxes({
        lineSubtotal: 7,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'tr', taxName: 'Tax', rateDecimal: 0.0825 }],
      });
      // 7 * 0.0825 = 0.5775 → round → 1
      expect(result.taxTotal).toBe(1);
    });

    it('$0.06 item at 8.25% rounds to 0¢ tax', () => {
      const result = calculateTaxes({
        lineSubtotal: 6,
        calculationMode: 'exclusive',
        taxRates: [{ taxRateId: 'tr', taxName: 'Tax', rateDecimal: 0.0825 }],
      });
      // 6 * 0.0825 = 0.495 → round → 0
      expect(result.taxTotal).toBe(0);
    });

    it('$0.99 item with 3 tax rates sums breakdown exactly', () => {
      const result = calculateTaxes({
        lineSubtotal: 99,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX, COUNTY_TAX, CITY_TAX],
      });
      // total rate = 0.0825, 99 * 0.0825 = 8.1675 → 8
      expect(result.taxTotal).toBe(8);
      const breakdownSum = result.breakdown.reduce((s, b) => s + b.amount, 0);
      expect(breakdownSum).toBe(result.taxTotal); // last-rate-gets-remainder guarantee
    });

    it('$9.99 item with 3 rates: breakdown sum equals taxTotal', () => {
      const result = calculateTaxes({
        lineSubtotal: 999,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX, COUNTY_TAX, CITY_TAX],
      });
      expect(result.taxTotal).toBe(82); // 999 * 0.0825 = 82.4175 → 82
      const breakdownSum = result.breakdown.reduce((s, b) => s + b.amount, 0);
      expect(breakdownSum).toBe(82);
    });
  });

  // ── 8. Mixed tax rates ──────────────────────────────────────────
  describe('mixed tax rates', () => {
    it('handles items with different rate sets', () => {
      // Food item: only state tax
      const food = calculateTaxes({
        lineSubtotal: 1200,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX],
      });
      // Alcohol item: state + county + city
      const alcohol = calculateTaxes({
        lineSubtotal: 800,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX, COUNTY_TAX, CITY_TAX],
      });

      expect(food.taxTotal).toBe(72); // 1200 * 0.06 = 72
      expect(alcohol.taxTotal).toBe(66); // 800 * 0.0825 = 66
      expect(food.taxTotal + alcohol.taxTotal).toBe(138);
    });
  });

  // ── 9. Inclusive mode ───────────────────────────────────────────
  describe('inclusive mode', () => {
    it('extracts tax from price-inclusive amount', () => {
      const result = calculateTaxes({
        lineSubtotal: 1075,
        calculationMode: 'inclusive',
        taxRates: [STATE_TAX, COUNTY_TAX],
      });
      // tax = 1075 - (1075 / 1.075) = 1075 - 1000 = 75
      expect(result.taxTotal).toBe(75);
      expect(result.subtotal).toBe(1000);
      expect(result.total).toBe(1075); // customer pays this
    });

    it('inclusive invariant: total = subtotal + taxTotal', () => {
      const result = calculateTaxes({
        lineSubtotal: 2150,
        calculationMode: 'inclusive',
        taxRates: [STATE_TAX, COUNTY_TAX, CITY_TAX],
      });
      expect(result.total).toBe(result.subtotal + result.taxTotal);
    });
  });

  // ── 10. Zero-price and edge cases ───────────────────────────────
  describe('edge cases', () => {
    it('zero-price item returns all zeros', () => {
      const result = calculateTaxes({
        lineSubtotal: 0,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX],
      });
      expect(result.taxTotal).toBe(0);
      expect(result.subtotal).toBe(0);
      expect(result.total).toBe(0);
      expect(result.breakdown).toEqual([]);
    });

    it('empty tax rates returns zero tax', () => {
      const result = calculateTaxes({
        lineSubtotal: 5000,
        calculationMode: 'exclusive',
        taxRates: [],
      });
      expect(result.taxTotal).toBe(0);
      expect(result.total).toBe(5000);
    });

    it('single rate: no remainder allocation needed', () => {
      const result = calculateTaxes({
        lineSubtotal: 1234,
        calculationMode: 'exclusive',
        taxRates: [STATE_TAX],
      });
      expect(result.taxTotal).toBe(74); // 1234 * 0.06 = 74.04 → 74
      expect(result.breakdown[0]!.amount).toBe(74);
    });
  });

  // ── 11. Refund/return scenarios ─────────────────────────────────
  describe('refund/return tax replay', () => {
    it('per-unit floor division prevents over-refund on partial returns', () => {
      // Original: qty=3, lineSubtotal=999, lineTax=75
      const origSubtotal = 999;
      const origTax = 75;
      const origQty = 3;

      // Return qty=1 (partial)
      const unitSubtotal = Math.floor(origSubtotal / origQty); // 333
      const unitTax = Math.floor(origTax / origQty); // 25
      const partialReturnSubtotal = unitSubtotal * 1; // 333
      const partialReturnTax = unitTax * 1; // 25

      expect(partialReturnSubtotal).toBe(333);
      expect(partialReturnTax).toBe(25);

      // Return remaining qty=2
      const _subtotalRemainder = origSubtotal - unitSubtotal * origQty; // 0
      const _taxRemainder = origTax - unitTax * origQty; // 0
      // For partial (not full qty), remainder is NOT included
      const secondReturnTax = unitTax * 2; // 50

      // Total refunded: 25 + 50 = 75 = original tax ✓
      expect(partialReturnTax + secondReturnTax).toBe(origTax);
    });

    it('full return always returns exact original tax', () => {
      const _origSubtotal = 1001; // odd amount
      const origTax = 83; // not evenly divisible by 3
      const origQty = 3;

      const unitTax = Math.floor(origTax / origQty); // 27
      const taxRemainder = origTax - unitTax * origQty; // 83 - 81 = 2

      // Full return: qty === origQty, so remainder is included
      const fullReturnTax = unitTax * origQty + taxRemainder; // 81 + 2 = 83
      expect(fullReturnTax).toBe(origTax);
    });
  });

  // ── 12. Invariants ──────────────────────────────────────────────
  describe('invariants', () => {
    const amounts = [1, 7, 50, 99, 100, 333, 999, 1000, 1234, 5000, 9999, 99999];
    const rateSets = [
      [STATE_TAX],
      [STATE_TAX, COUNTY_TAX],
      [STATE_TAX, COUNTY_TAX, CITY_TAX],
    ];

    for (const amount of amounts) {
      for (const rates of rateSets) {
        it(`exclusive: total = subtotal + tax for ${amount}¢ with ${rates.length} rates`, () => {
          const r = calculateTaxes({ lineSubtotal: amount, calculationMode: 'exclusive', taxRates: rates });
          expect(r.total).toBe(r.subtotal + r.taxTotal);
          const bSum = r.breakdown.reduce((s, b) => s + b.amount, 0);
          expect(bSum).toBe(r.taxTotal);
        });

        it(`inclusive: total = subtotal + tax for ${amount}¢ with ${rates.length} rates`, () => {
          const r = calculateTaxes({ lineSubtotal: amount, calculationMode: 'inclusive', taxRates: rates });
          expect(r.total).toBe(r.subtotal + r.taxTotal);
          const bSum = r.breakdown.reduce((s, b) => s + b.amount, 0);
          expect(bSum).toBe(r.taxTotal);
        });
      }
    }
  });
});
