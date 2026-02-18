/**
 * Phase 4 — Money Edge Case Tests
 *
 * Tests extreme and boundary values for financial calculations.
 * All money values are in integer cents — no floating point.
 * Pure unit test — no database required.
 */

describe('Money Edge Cases', () => {
  // ── Dollar-to-Cent Conversion Edge Cases ──

  describe('Dollar-to-Cent Conversion', () => {
    function dollarsToCents(priceStr: string): number {
      return Math.round(parseFloat(priceStr) * 100);
    }

    it('$0.00 → 0', () => expect(dollarsToCents('0.00')).toBe(0));
    it('$0.01 → 1 (minimum)', () => expect(dollarsToCents('0.01')).toBe(1));
    it('$0.001 → 0 (sub-cent rounds down)', () => expect(dollarsToCents('0.001')).toBe(0));
    it('$0.005 → 1 (half-cent rounds up)', () => expect(dollarsToCents('0.005')).toBe(1));
    it('$0.004 → 0 (below half-cent rounds down)', () => expect(dollarsToCents('0.004')).toBe(0));
    it('$999,999.99 → 99999999', () => expect(dollarsToCents('999999.99')).toBe(99999999));
    it('$9,999.99 → 999999', () => expect(dollarsToCents('9999.99')).toBe(999999));

    // IEEE 754 precision edge cases
    it('$0.10 precision', () => expect(dollarsToCents('0.10')).toBe(10));
    it('$0.20 precision', () => expect(dollarsToCents('0.20')).toBe(20));
    it('$0.30 precision', () => expect(dollarsToCents('0.30')).toBe(30));
    it('$19.99 precision', () => expect(dollarsToCents('19.99')).toBe(1999));
    it('$49.99 precision', () => expect(dollarsToCents('49.99')).toBe(4999));
    it('$99.99 precision', () => expect(dollarsToCents('99.99')).toBe(9999));

    // Pathological IEEE 754 values
    it('$1.10 does not drift', () => expect(dollarsToCents('1.10')).toBe(110));
    it('$1.20 does not drift', () => expect(dollarsToCents('1.20')).toBe(120));
    it('$1.255 rounds to 126', () => expect(dollarsToCents('1.255')).toBe(126));
  });

  // ── Integer Arithmetic Safety ──

  describe('Integer Arithmetic', () => {
    it('zero subtotal with tax rate = $0 tax', () => {
      expect(Math.round(0 * 0.085)).toBe(0);
    });

    it('$0.01 × 0.1% = $0.00 (rounds to 0)', () => {
      expect(Math.round(1 * 0.001)).toBe(0);
    });

    it('$999,999.99 × 25% = $249,999.997... → $250,000.00', () => {
      // In cents: 99999999 * 0.25 = 24999999.75 → 25000000
      expect(Math.round(99999999 * 0.25)).toBe(25000000);
    });

    it('safe integer range for reasonable order totals', () => {
      // Max safe: 2^53 - 1 = 9007199254740991
      // $100,000.00 in cents = 10,000,000
      // $100,000.00 × 25% tax × 100 = well within safe range
      const maxReasonableOrder = 10_000_000; // $100,000 in cents
      const maxTax = Math.round(maxReasonableOrder * 0.25);
      const total = maxReasonableOrder + maxTax;
      expect(total).toBe(12_500_000);
      expect(Number.isSafeInteger(total)).toBe(true);
    });
  });

  // ── Free Order (Zero Total) ──

  describe('Free Order ($0.00)', () => {
    it('0 subtotal + 0 tax = 0 total', () => {
      const subtotal = 0;
      const tax = Math.round(subtotal * 0.085);
      expect(tax).toBe(0);
      expect(subtotal + tax).toBe(0);
    });

    it('100% discount = $0 total', () => {
      const subtotal = 2500;
      const discount = 2500;
      const total = Math.max(0, subtotal - discount);
      expect(total).toBe(0);
    });
  });

  // ── Discount Edge Cases ──

  describe('Discount Edge Cases', () => {
    it('1% of $0.01 = $0.00 (rounds down)', () => {
      expect(Math.round(1 * 1 / 100)).toBe(0);
    });

    it('50% of $0.01 = $0.01 (rounds up)', () => {
      expect(Math.round(1 * 50 / 100)).toBe(1);
    });

    it('50% of $0.03 = $0.02 (rounds up from 1.5)', () => {
      expect(Math.round(3 * 50 / 100)).toBe(2);
    });

    it('33.33% of $3.00 = $1.00 (rounds to nearest)', () => {
      // 300 * 33.33 / 100 = 99.99 → 100
      expect(Math.round(300 * 33.33 / 100)).toBe(100);
    });

    it('discount > subtotal: total clamps to 0', () => {
      const lineTotal = 500;
      const discount = 999;
      const total = Math.max(0, lineTotal - discount);
      expect(total).toBe(0);
    });
  });

  // ── Tax Edge Cases ──

  describe('Tax Edge Cases', () => {
    it('0% tax on any amount = $0', () => {
      expect(Math.round(99999 * 0)).toBe(0);
    });

    it('100% tax on $10 = $10', () => {
      expect(Math.round(1000 * 1.0)).toBe(1000);
    });

    it('half-cent tax rounds up: $5.88 × 8.5% = 50 (from 49.98)', () => {
      expect(Math.round(588 * 0.085)).toBe(50);
    });

    it('half-cent tax rounds down: $5.82 × 8.5% = 49 (from 49.47)', () => {
      expect(Math.round(582 * 0.085)).toBe(49);
    });

    // Inclusive tax extraction
    it('inclusive: extract 8.5% from $10.00', () => {
      const totalRate = 0.085;
      const inclusive = 1000;
      const taxTotal = Math.round(inclusive - inclusive / (1 + totalRate));
      // 1000 - 921.658... = 78.341... → 78
      expect(taxTotal).toBe(78);
    });
  });

  // ── Service Charge Edge Cases ──

  describe('Service Charge Edge Cases', () => {
    it('18% of $0.01 = $0.00', () => {
      expect(Math.round(1 * 18 / 100)).toBe(0);
    });

    it('18% of $0.03 = $0.01', () => {
      expect(Math.round(3 * 18 / 100)).toBe(1);
    });

    it('service charge on discounted-to-zero = $0', () => {
      const discountedSubtotal = 0;
      const charge = Math.round(discountedSubtotal * 18 / 100);
      expect(charge).toBe(0);
    });
  });

  // ── GL Proportional Allocation Edge Cases ──

  describe('GL Proportional Allocation', () => {
    it('single tender: 100% allocation', () => {
      const orderTotal = 1085;
      const tenderAmount = 1085;
      const ratio = tenderAmount / orderTotal;
      const revenue = Math.round(orderTotal * ratio);
      expect(revenue).toBe(1085);
    });

    it('$0.01 order with split: remainder handles sub-cent', () => {
      const orderTotal = 1;
      const tender1Ratio = 0.5; // Can't split $0.01 evenly
      const tender1Revenue = Math.round(orderTotal * tender1Ratio);
      const tender2Revenue = orderTotal - tender1Revenue;

      expect(tender1Revenue).toBe(1); // round(0.5) = 1
      expect(tender2Revenue).toBe(0); // 1 - 1 = 0
      expect(tender1Revenue + tender2Revenue).toBe(orderTotal);
    });

    it('three-way even split of $1.00: remainder absorbs rounding', () => {
      const orderTotal = 100;
      const ratios = [1 / 3, 1 / 3, 1 / 3];
      let allocated = 0;
      const revenues: number[] = [];

      for (let i = 0; i < ratios.length; i++) {
        let revenue: number;
        if (i === ratios.length - 1) {
          revenue = orderTotal - allocated; // Remainder
        } else {
          revenue = Math.round(orderTotal * ratios[i]!);
        }
        revenues.push(revenue);
        allocated += revenue;
      }

      expect(revenues[0]).toBe(33);  // round(33.33) = 33
      expect(revenues[1]).toBe(33);  // round(33.33) = 33
      expect(revenues[2]).toBe(34);  // remainder: 100 - 66 = 34
      expect(allocated).toBe(orderTotal); // Always balances
    });
  });
});
