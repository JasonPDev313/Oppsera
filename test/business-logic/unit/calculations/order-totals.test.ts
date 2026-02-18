/**
 * Phase 1A — Order Total Calculations (Pure Unit Tests)
 *
 * Tests the recalculateOrderTotals() pure function with every
 * combination of lines, charges, discounts.
 * No database needed — these are pure calculation tests.
 */

import { recalculateOrderTotals } from '@oppsera/module-orders/helpers/order-totals';

describe('Order Total Calculations', () => {
  // ── Simple Orders ──

  it('calculates subtotal from single line', () => {
    const result = recalculateOrderTotals(
      [{ lineSubtotal: 1000, lineTax: 85, lineTotal: 1085 }],
      [],
      [],
    );
    expect(result.subtotal).toBe(1000);
    expect(result.taxTotal).toBe(85);
    expect(result.total).toBe(1085);
  });

  it('sums multiple line items correctly', () => {
    const lines = [
      { lineSubtotal: 999, lineTax: 85, lineTotal: 1084 },
      { lineSubtotal: 1499, lineTax: 127, lineTotal: 1626 },
      { lineSubtotal: 500, lineTax: 43, lineTotal: 543 },
    ];
    const result = recalculateOrderTotals(lines, [], []);
    expect(result.subtotal).toBe(2998); // 999 + 1499 + 500
    expect(result.taxTotal).toBe(255);  // 85 + 127 + 43
    expect(result.total).toBe(3253);    // 1084 + 1626 + 543
  });

  it('handles empty order (no lines)', () => {
    const result = recalculateOrderTotals([], [], []);
    expect(result.subtotal).toBe(0);
    expect(result.taxTotal).toBe(0);
    expect(result.serviceChargeTotal).toBe(0);
    expect(result.discountTotal).toBe(0);
    expect(result.total).toBe(0);
  });

  // ── Discounts ──

  it('applies fixed discount', () => {
    const result = recalculateOrderTotals(
      [{ lineSubtotal: 1000, lineTax: 85, lineTotal: 1085 }],
      [],
      [{ amount: 200 }], // $2.00 discount
    );
    expect(result.discountTotal).toBe(200);
    expect(result.total).toBe(885); // 1085 - 200
  });

  it('applies percentage discount (pre-calculated amount)', () => {
    // 10% off $10.00 = $1.00 discount (100 cents)
    const result = recalculateOrderTotals(
      [{ lineSubtotal: 1000, lineTax: 85, lineTotal: 1085 }],
      [],
      [{ amount: 100 }],
    );
    expect(result.discountTotal).toBe(100);
    expect(result.total).toBe(985); // 1085 - 100
  });

  it('stacks multiple discounts', () => {
    const result = recalculateOrderTotals(
      [{ lineSubtotal: 2000, lineTax: 170, lineTotal: 2170 }],
      [],
      [{ amount: 200 }, { amount: 100 }], // $2 + $1 discounts
    );
    expect(result.discountTotal).toBe(300);
    expect(result.total).toBe(1870); // 2170 - 300
  });

  it('clamps total to zero when discount exceeds order value', () => {
    const result = recalculateOrderTotals(
      [{ lineSubtotal: 100, lineTax: 9, lineTotal: 109 }],
      [],
      [{ amount: 500 }], // $5 discount on $1.09 order
    );
    expect(result.discountTotal).toBe(500);
    expect(result.total).toBe(0); // Math.max(0, 109 - 500)
  });

  it('handles 100% discount (full comp)', () => {
    const result = recalculateOrderTotals(
      [{ lineSubtotal: 1000, lineTax: 85, lineTotal: 1085 }],
      [],
      [{ amount: 1085 }], // Exact comp of total including tax
    );
    expect(result.total).toBe(0);
  });

  // ── Service Charges ──

  it('adds service charge to total', () => {
    const result = recalculateOrderTotals(
      [{ lineSubtotal: 1000, lineTax: 85, lineTotal: 1085 }],
      [{ amount: 180, taxAmount: 0 }], // $1.80 service charge
      [],
    );
    expect(result.serviceChargeTotal).toBe(180);
    expect(result.total).toBe(1265); // 1085 + 180
  });

  it('adds taxable service charge', () => {
    const result = recalculateOrderTotals(
      [{ lineSubtotal: 1000, lineTax: 85, lineTotal: 1085 }],
      [{ amount: 180, taxAmount: 15 }], // $1.80 charge + $0.15 tax on charge
      [],
    );
    expect(result.serviceChargeTotal).toBe(180);
    expect(result.taxTotal).toBe(100); // 85 line tax + 15 charge tax
    expect(result.total).toBe(1280);   // 1085 + 180 + 15
  });

  // ── Combined: Lines + Charges + Discounts ──

  it('calculates full order: lines + charge + discount', () => {
    // 2 items: $10.00 + $15.00 = $25.00 subtotal
    // Tax: $0.85 + $1.28 = $2.13
    // Service charge: $4.50 (18% of discounted subtotal)
    // Discount: $2.50
    const lines = [
      { lineSubtotal: 1000, lineTax: 85, lineTotal: 1085 },
      { lineSubtotal: 1500, lineTax: 128, lineTotal: 1628 },
    ];
    const charges = [{ amount: 450, taxAmount: 0 }];
    const discounts = [{ amount: 250 }];

    const result = recalculateOrderTotals(lines, charges, discounts);

    expect(result.subtotal).toBe(2500);
    expect(result.taxTotal).toBe(213); // line taxes only (charge tax = 0)
    expect(result.serviceChargeTotal).toBe(450);
    expect(result.discountTotal).toBe(250);
    // total = (1085 + 1628) + 450 + 0 - 250 + 0 = 2913
    expect(result.total).toBe(2913);
  });

  // ── Rounding Adjustment ──

  it('applies rounding adjustment', () => {
    const result = recalculateOrderTotals(
      [{ lineSubtotal: 999, lineTax: 85, lineTotal: 1084 }],
      [],
      [],
      1, // +1 cent rounding
    );
    expect(result.roundingAdjustment).toBe(1);
    expect(result.total).toBe(1085); // 1084 + 1
  });

  it('applies negative rounding adjustment', () => {
    const result = recalculateOrderTotals(
      [{ lineSubtotal: 999, lineTax: 85, lineTotal: 1084 }],
      [],
      [],
      -1, // -1 cent rounding
    );
    expect(result.roundingAdjustment).toBe(-1);
    expect(result.total).toBe(1083); // 1084 - 1
  });

  // ── Quantity Variations ──

  it('handles high quantity (100 items)', () => {
    // 100 × $0.33 = $33.00 subtotal
    const lines = Array.from({ length: 100 }, () => ({
      lineSubtotal: 33,
      lineTax: 3, // ~8.5% rounded
      lineTotal: 36,
    }));
    const result = recalculateOrderTotals(lines, [], []);
    expect(result.subtotal).toBe(3300); // 33 × 100
    expect(result.taxTotal).toBe(300);  // 3 × 100
    expect(result.total).toBe(3600);    // 36 × 100
  });

  // ── INVARIANT CHECKS ──

  it('INVARIANT: total >= 0 always', () => {
    // Extreme discount
    const result = recalculateOrderTotals(
      [{ lineSubtotal: 1, lineTax: 0, lineTotal: 1 }],
      [],
      [{ amount: 99999 }],
    );
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('INVARIANT: subtotal = sum(lineSubtotal) for any number of lines', () => {
    for (let n = 0; n <= 20; n++) {
      const lines = Array.from({ length: n }, (_, i) => ({
        lineSubtotal: 100 + i * 33,
        lineTax: 0,
        lineTotal: 100 + i * 33,
      }));
      const result = recalculateOrderTotals(lines, [], []);
      const expectedSubtotal = lines.reduce((s, l) => s + l.lineSubtotal, 0);
      expect(result.subtotal).toBe(expectedSubtotal);
    }
  });

  it('INVARIANT: taxTotal = sum(lineTax) + sum(chargeTax)', () => {
    const lines = [
      { lineSubtotal: 1000, lineTax: 85, lineTotal: 1085 },
      { lineSubtotal: 2000, lineTax: 170, lineTotal: 2170 },
    ];
    const charges = [
      { amount: 300, taxAmount: 26 },
      { amount: 200, taxAmount: 17 },
    ];
    const result = recalculateOrderTotals(lines, charges, []);

    const expectedTax = (85 + 170) + (26 + 17);
    expect(result.taxTotal).toBe(expectedTax); // 298
  });
});
