/**
 * Phase 1A (cont) — Rounding Strategy Verification
 *
 * Documents and tests the rounding rule used across the system.
 * OppsEra uses Math.round() (round half away from zero) on all cent calculations.
 *
 * MONEY REPRESENTATION:
 *   Catalog: dollars as NUMERIC(10,2) → string in TypeScript (e.g., "9.99")
 *   Orders/Payments: cents as INTEGER → number in TypeScript (e.g., 999)
 *   Conversion: Math.round(parseFloat(dollarString) * 100)
 */

describe('Rounding Strategy', () => {
  // ── Money Conversion ──

  describe('Dollar-to-Cent Conversion', () => {
    function dollarsToCents(priceStr: string): number {
      return Math.round(parseFloat(priceStr) * 100);
    }

    it('$10.00 → 1000', () => expect(dollarsToCents('10.00')).toBe(1000));
    it('$9.99 → 999', () => expect(dollarsToCents('9.99')).toBe(999));
    it('$0.01 → 1', () => expect(dollarsToCents('0.01')).toBe(1));
    it('$0.00 → 0', () => expect(dollarsToCents('0.00')).toBe(0));
    it('$999.99 → 99999', () => expect(dollarsToCents('999.99')).toBe(99999));
    it('$1.50 → 150', () => expect(dollarsToCents('1.50')).toBe(150));

    // Edge: floating point precision
    it('$19.99 does not drift', () => {
      // 19.99 * 100 = 1998.9999999... in IEEE 754
      // Math.round() handles this correctly
      expect(dollarsToCents('19.99')).toBe(1999);
    });

    it('$0.10 does not drift', () => {
      // 0.10 has exact IEEE 754 representation issues
      expect(dollarsToCents('0.10')).toBe(10);
    });
  });

  // ── Math.round Behavior ──

  describe('Math.round Semantics', () => {
    it('rounds 0.5 up (standard)', () => expect(Math.round(0.5)).toBe(1));
    it('rounds 0.499 down', () => expect(Math.round(0.499)).toBe(0));
    it('rounds 1.5 up', () => expect(Math.round(1.5)).toBe(2));
    it('rounds 2.5 up (not banker\'s)', () => expect(Math.round(2.5)).toBe(3));
    it('rounds -0.5 to 0 (toward positive)', () => expect(Math.round(-0.5)).toBe(0));
    it('rounds -1.5 to -1', () => expect(Math.round(-1.5)).toBe(-1));
  });

  // ── Line Subtotal Calculation ──

  describe('Line Subtotal: qty × unitPrice', () => {
    function lineSubtotal(qty: number, unitPriceCents: number): number {
      return Math.round(qty * unitPriceCents);
    }

    it('1 × 999 = 999', () => expect(lineSubtotal(1, 999)).toBe(999));
    it('3 × 999 = 2997', () => expect(lineSubtotal(3, 999)).toBe(2997));
    it('10 × 333 = 3330', () => expect(lineSubtotal(10, 333)).toBe(3330));

    // Fractional qty (F&B items)
    it('0.5 × 1000 = 500', () => expect(lineSubtotal(0.5, 1000)).toBe(500));
    it('1.5 × 1000 = 1500', () => expect(lineSubtotal(1.5, 1000)).toBe(1500));
    it('0.33 × 1000 = 330', () => expect(lineSubtotal(0.33, 1000)).toBe(330));

    // Stress: large quantity
    it('100 × 9999 = 999900', () => expect(lineSubtotal(100, 9999)).toBe(999900));
  });

  // ── Tax Rounding on Line Items ──

  describe('Per-Line Tax Rounding', () => {
    function lineTax(subtotalCents: number, rate: number): number {
      return Math.round(subtotalCents * rate);
    }

    // The known rounding divergence: per-line vs per-order
    it('documents per-line rounding behavior for $0.33 at 7.5%', () => {
      // Per-line: round(33 * 0.075) = round(2.475) = 2
      expect(lineTax(33, 0.075)).toBe(2);
    });

    it('documents accumulation: 100 × per-line vs. batch', () => {
      const perLineTotal = 100 * lineTax(33, 0.075); // 100 × 2 = 200
      const batchTotal = lineTax(3300, 0.075);         // round(247.5) = 248

      // Per-line produces 200, batch produces 248
      // This 48-cent difference is expected behavior for per-line systems
      expect(perLineTotal).toBe(200);
      expect(batchTotal).toBe(248);
      expect(perLineTotal).toBeLessThan(batchTotal);
    });

    it('percentage discount on line: $9.99 × 10% rounds correctly', () => {
      // Discount amount: round(999 * 10 / 100) = round(99.9) = 100
      const discountAmount = Math.round(999 * 10 / 100);
      expect(discountAmount).toBe(100); // $1.00 discount, not $0.99
    });
  });

  // ── GL Entry Rounding ──

  describe('GL Proportional Allocation Rounding', () => {
    it('proportional allocation balances with remainder method', () => {
      // Order: $25.00 total, 2 tenders ($15 + $10)
      // Tender 1 ($15): ratio = 15/25 = 0.6
      // Revenue allocation: round(2500 * 0.6) = round(1500) = 1500
      // Tender 2 ($10): remainder = 2500 - 1500 = 1000
      const orderTotal = 2500;
      const tender1Amount = 1500;
      const tender1Ratio = tender1Amount / orderTotal;

      const tender1Revenue = Math.round(orderTotal * tender1Ratio);
      const tender2Revenue = orderTotal - tender1Revenue; // remainder

      expect(tender1Revenue).toBe(1500);
      expect(tender2Revenue).toBe(1000);
      expect(tender1Revenue + tender2Revenue).toBe(orderTotal);
    });

    it('proportional allocation handles odd splits', () => {
      // Order: $10.00 total, 3 tenders ($3.33 + $3.33 + $3.34)
      const orderTotal = 1000;
      const amounts = [333, 333, 334];
      let allocated = 0;

      for (let i = 0; i < amounts.length; i++) {
        const ratio = amounts[i]! / orderTotal;
        let revenue: number;

        if (i === amounts.length - 1) {
          revenue = orderTotal - allocated; // remainder
        } else {
          revenue = Math.round(orderTotal * ratio);
        }
        allocated += revenue;
      }

      expect(allocated).toBe(orderTotal); // Must balance exactly
    });
  });
});
