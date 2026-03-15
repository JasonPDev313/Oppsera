import { describe, it, expect } from 'vitest';
import { recalculateOrderTotals } from '../helpers/order-totals';
import { calculateTaxes } from '@oppsera/core/helpers/tax-calc';

const STATE_TAX = { taxRateId: 'tr_state', taxName: 'State Tax', rateDecimal: 0.06 };
const COUNTY_TAX = { taxRateId: 'tr_county', taxName: 'County Tax', rateDecimal: 0.015 };
const RATES = [STATE_TAX, COUNTY_TAX]; // 7.5% combined

describe('recalculateOrderTotals', () => {
  it('sums line-level taxes (not cart-level)', () => {
    const lines = [333, 333, 333].map((sub) => {
      const tax = calculateTaxes({ lineSubtotal: sub, calculationMode: 'exclusive', taxRates: RATES });
      return { lineSubtotal: tax.subtotal, lineTax: tax.taxTotal, lineTotal: tax.total };
    });

    const totals = recalculateOrderTotals(lines, [], []);
    expect(totals.taxTotal).toBe(75);
    expect(totals.subtotal).toBe(999);
    expect(totals.total).toBe(1074);
  });

  it('service charge with tax included in totals', () => {
    const lines = [{ lineSubtotal: 2000, lineTax: 150, lineTotal: 2150 }];
    const charges = [{ amount: 400, taxAmount: 30 }];

    const totals = recalculateOrderTotals(lines, charges, []);
    expect(totals.serviceChargeTotal).toBe(400);
    expect(totals.taxTotal).toBe(180);
    expect(totals.total).toBe(2580);
  });

  it('rounding adjustment applied correctly', () => {
    const lines = [{ lineSubtotal: 997, lineTax: 75, lineTotal: 1072 }];
    const totals = recalculateOrderTotals(lines, [], [], 3);
    expect(totals.roundingAdjustment).toBe(3);
    expect(totals.total).toBe(1075);
  });

  it('total never goes negative', () => {
    const lines = [{ lineSubtotal: 100, lineTax: 8, lineTotal: 108 }];
    const discounts = [{ amount: 200 }];
    const totals = recalculateOrderTotals(lines, [], discounts);
    expect(totals.total).toBe(0);
  });
});

describe('discount proration algorithm', () => {
  // Mirrors production: prorates by lineTotal (customer-facing value), clamps at lineTotal
  function prorateDiscount(lineTotals: number[], discountTotal: number): number[] {
    const prorationBasis = lineTotals.reduce((s, v) => s + v, 0);
    if (discountTotal <= 0 || prorationBasis <= 0) return lineTotals.map(() => 0);
    const allocations: number[] = [];
    let allocated = 0;
    for (let i = 0; i < lineTotals.length; i++) {
      let lineAlloc: number;
      if (i === lineTotals.length - 1) {
        lineAlloc = discountTotal - allocated;
      } else {
        lineAlloc = Math.round(discountTotal * (lineTotals[i]! / prorationBasis));
      }
      lineAlloc = Math.max(0, Math.min(lineAlloc, lineTotals[i]!));
      allocations.push(lineAlloc);
      allocated += lineAlloc;
    }
    return allocations;
  }

  it('prorates proportionally by line total', () => {
    // Exclusive: lineTotal = lineSubtotal + lineTax
    // Line A: sub=1000, tax=75, total=1075
    // Line B: sub=2000, tax=150, total=2150
    // Discount=600, basis=3225
    const allocs = prorateDiscount([1075, 2150], 600);
    expect(allocs[0]).toBe(Math.round(600 * (1075 / 3225))); // 200
    expect(allocs[1]).toBe(600 - allocs[0]!); // 400
  });

  it('last line absorbs rounding remainder', () => {
    const allocs = prorateDiscount([1075, 1075, 1075], 100);
    expect(allocs[0]).toBe(33);
    expect(allocs[1]).toBe(33);
    expect(allocs[2]).toBe(34);
    expect(allocs.reduce((s, v) => s + v, 0)).toBe(100);
  });

  it('handles single line', () => {
    expect(prorateDiscount([1575], 300)[0]).toBe(300);
  });

  it('handles zero discount', () => {
    expect(prorateDiscount([1075, 2150], 0)).toEqual([0, 0]);
  });

  it('caps allocation at line total (not subtotal)', () => {
    // Discount exceeds individual lineTotals but not their sum
    const allocs = prorateDiscount([100, 200], 500);
    expect(allocs[0]!).toBeLessThanOrEqual(100);
    expect(allocs[1]!).toBeLessThanOrEqual(200);
  });

  it('many small lines: sum always equals discount total', () => {
    const lines = Array.from({ length: 7 }, (_, i) => 143 + i);
    const allocs = prorateDiscount(lines, 50);
    expect(allocs.reduce((s, v) => s + v, 0)).toBe(50);
  });

  it('discount exceeds single line lineSubtotal but not lineTotal (exclusive)', () => {
    // Line: sub=100, tax=8, total=108. Discount=105.
    // Old bug: clamp at lineSubtotal=100 would lose 5 cents.
    // Fixed: clamp at lineTotal=108, allocation=105 passes through.
    const allocs = prorateDiscount([108], 105);
    expect(allocs[0]).toBe(105);
  });

  it('discount equals total order value — all lines zeroed', () => {
    const allocs = prorateDiscount([500, 500], 1000);
    expect(allocs[0]).toBe(500);
    expect(allocs[1]).toBe(500);
    expect(allocs.reduce((s, v) => s + v, 0)).toBe(1000);
  });
});

describe('finalized line values (Approach A)', () => {
  // Simulates what recalculateOrderTaxesAfterDiscount computes per-line

  describe('exclusive mode discount', () => {
    it('produces correct finalized values for a single line', () => {
      // Original: $10.00 item, 7.5% exclusive tax
      const lineSubtotal = 1000;
      const discount = 200;
      const taxableBase = lineSubtotal - discount; // 800

      const taxResult = calculateTaxes({
        lineSubtotal: taxableBase,
        calculationMode: 'exclusive',
        taxRates: RATES,
      });

      const finalSubtotal = taxableBase; // 800
      const finalTax = taxResult.taxTotal; // round(800 * 0.075) = 60
      const finalTotal = finalSubtotal + finalTax; // 860

      expect(finalSubtotal).toBe(800);
      expect(finalTax).toBe(60);
      expect(finalTotal).toBe(860);
      // Invariant: finalTotal = finalSubtotal + finalTax
      expect(finalTotal).toBe(finalSubtotal + finalTax);
    });

    it('order totals from finalized values are self-consistent', () => {
      // 2 lines, $10 and $20, $6 discount, 7.5% tax
      const lines = [
        { sub: 1000, alloc: 200 }, // 1/3 of 600
        { sub: 2000, alloc: 400 }, // 2/3 of 600
      ];

      let orderSubtotal = 0;
      let orderTax = 0;
      let orderTotal = 0;

      for (const l of lines) {
        const base = l.sub - l.alloc;
        const tax = calculateTaxes({ lineSubtotal: base, calculationMode: 'exclusive', taxRates: RATES });
        orderSubtotal += base;
        orderTax += tax.taxTotal;
        orderTotal += base + tax.taxTotal;
      }

      expect(orderSubtotal).toBe(2400); // 800 + 1600
      expect(orderTax).toBe(180); // 60 + 120
      expect(orderTotal).toBe(2580); // 860 + 1720
      expect(orderTotal).toBe(orderSubtotal + orderTax);
    });
  });

  describe('inclusive mode discount', () => {
    it('produces correct finalized values for inclusive pricing', () => {
      // Original: $10.75 sticker price (inclusive of 7.5% tax)
      // lineSubtotal = 1000 (pre-tax), lineTax = 75, lineTotal = 1075 (gross)
      const lineTotal = 1075; // original gross
      const discount = 200;
      const discountedGross = lineTotal - discount; // 875

      const taxResult = calculateTaxes({
        lineSubtotal: discountedGross,
        calculationMode: 'inclusive',
        taxRates: RATES,
      });

      const finalSubtotal = taxResult.subtotal; // 875 - 61 = 814
      const finalTax = taxResult.taxTotal; // round(875 - 875/1.075) = 61
      const finalTotal = discountedGross; // 875

      expect(finalTax).toBe(61);
      expect(finalSubtotal).toBe(814);
      expect(finalTotal).toBe(875);
      // Invariant: finalTotal = finalSubtotal + finalTax
      expect(finalTotal).toBe(finalSubtotal + finalTax);
    });

    it('order totals from inclusive finalized values are self-consistent', () => {
      // Single inclusive line: $10.75 gross, $2.00 discount
      const discountedGross = 875;
      const tax = calculateTaxes({
        lineSubtotal: discountedGross,
        calculationMode: 'inclusive',
        taxRates: RATES,
      });

      const orderSubtotal = tax.subtotal; // 814
      const orderTax = tax.taxTotal; // 61
      const orderTotal = discountedGross; // 875
      const orderDiscount = 200;

      // The order total is the sum of finalized line totals (no discount subtraction)
      expect(orderTotal).toBe(orderSubtotal + orderTax);
      // discount is stored for display but already reflected in finalized values
      expect(orderDiscount).toBe(200);
      // Customer pays: $8.75 ✓
      expect(orderTotal).toBe(875);
    });
  });

  describe('mixed exclusive + inclusive lines with discount', () => {
    it('handles mixed tax modes correctly', () => {
      // Line A: exclusive, $10.00, no tax groups → non-taxable
      // Line B: inclusive, $10.75 (7.5% embedded), taxable
      // Discount: $4.00
      const lineASub = 1000; // exclusive non-taxable
      const lineBTotal = 1075; // inclusive gross
      const _lineBSub = 1000; // inclusive pre-tax base

      // Prorate by lineTotal (A=1000 non-taxable, B=1075 inclusive gross)
      // Discount=400, basis=2075
      const allocA = Math.round(400 * (1000 / 2075)); // 193
      const allocB = 400 - allocA; // 207

      // Line A: non-taxable, exclusive
      const finalA = { subtotal: lineASub - allocA, tax: 0, total: lineASub - allocA };
      expect(finalA.subtotal).toBe(1000 - 193); // 807
      expect(finalA.total).toBe(807);

      // Line B: inclusive, discount from gross
      const discountedGross = lineBTotal - allocB; // 1075 - 207 = 868
      const taxB = calculateTaxes({
        lineSubtotal: discountedGross,
        calculationMode: 'inclusive',
        taxRates: RATES,
      });
      const finalB = { subtotal: taxB.subtotal, tax: taxB.taxTotal, total: discountedGross };
      expect(finalB.total).toBe(868);
      // Invariant: subtotal + tax = total
      expect(finalB.subtotal + finalB.tax).toBe(finalB.total);

      // Order totals
      const orderSubtotal = finalA.subtotal + finalB.subtotal;
      const orderTax = finalA.tax + finalB.tax;
      const orderTotal = finalA.total + finalB.total;
      expect(orderTotal).toBe(orderSubtotal + orderTax);
    });
  });

  describe('refund with finalized values', () => {
    it('per-unit floor division works on finalized amounts', () => {
      // Original: exclusive, lineSubtotal=1000, discount=200, finalSubtotal=800, finalTax=60
      const origFinalSubtotal = 800;
      const origFinalTax = 60;
      const origQty = 3;

      // Return qty=1
      const unitSub = Math.floor(origFinalSubtotal / origQty); // 266
      const unitTax = Math.floor(origFinalTax / origQty); // 20
      const subRemainder = origFinalSubtotal - unitSub * origQty; // 800 - 798 = 2
      const taxRemainder = origFinalTax - unitTax * origQty; // 60 - 60 = 0

      // Partial return: qty=1
      expect(unitSub * 1).toBe(266);
      expect(unitTax * 1).toBe(20);

      // Full return: qty=3 (includes remainder)
      const fullReturnSub = unitSub * origQty + subRemainder;
      const fullReturnTax = unitTax * origQty + taxRemainder;
      expect(fullReturnSub).toBe(origFinalSubtotal);
      expect(fullReturnTax).toBe(origFinalTax);
    });
  });
});
