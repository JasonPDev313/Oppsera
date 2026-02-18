/**
 * Phase 1A (cont) — Discount & Service Charge Calculations
 *
 * Tests the business rules for discount and service charge computation.
 * Pure calculation tests — no database required.
 */

describe('Discount Calculations', () => {
  // Helper: simulate applyDiscount calculation
  function calculateDiscountAmount(
    type: 'percentage' | 'fixed',
    value: number,
    subtotal: number,
  ): number {
    if (type === 'percentage') {
      return Math.round(subtotal * value / 100);
    }
    return Math.round(value * 100); // dollars to cents
  }

  describe('Percentage Discounts', () => {
    it('10% off $10.00 = $1.00', () => {
      expect(calculateDiscountAmount('percentage', 10, 1000)).toBe(100);
    });

    it('10% off $9.99 = $1.00 (rounds up from 99.9)', () => {
      expect(calculateDiscountAmount('percentage', 10, 999)).toBe(100);
    });

    it('15% off $25.00 = $3.75', () => {
      expect(calculateDiscountAmount('percentage', 15, 2500)).toBe(375);
    });

    it('50% off $1.00 = $0.50', () => {
      expect(calculateDiscountAmount('percentage', 50, 100)).toBe(50);
    });

    it('100% off = full subtotal', () => {
      expect(calculateDiscountAmount('percentage', 100, 2500)).toBe(2500);
    });

    it('1% off $0.99 = $0.01 (rounds up from 0.0099)', () => {
      // 99 * 1 / 100 = 0.99 → rounds to 1
      expect(calculateDiscountAmount('percentage', 1, 99)).toBe(1);
    });
  });

  describe('Fixed Discounts', () => {
    it('$2.00 off', () => {
      expect(calculateDiscountAmount('fixed', 2, 1000)).toBe(200);
    });

    it('$0.01 off (minimum)', () => {
      expect(calculateDiscountAmount('fixed', 0.01, 1000)).toBe(1);
    });

    it('$5.50 off', () => {
      expect(calculateDiscountAmount('fixed', 5.50, 1000)).toBe(550);
    });
  });
});

describe('Service Charge Calculations', () => {
  // Helper: simulate addServiceCharge calculation
  function calculateServiceChargeAmount(
    calculationType: 'percentage' | 'fixed',
    value: number,
    subtotal: number,
    discountTotal: number,
  ): number {
    const discountedSubtotal = subtotal - discountTotal;
    if (calculationType === 'percentage') {
      return Math.round(discountedSubtotal * value / 100);
    }
    return value; // Fixed: already in cents
  }

  describe('Service Charge on Raw Subtotal', () => {
    it('18% on $100.00 = $18.00', () => {
      expect(calculateServiceChargeAmount('percentage', 18, 10000, 0)).toBe(1800);
    });

    it('20% on $50.00 = $10.00', () => {
      expect(calculateServiceChargeAmount('percentage', 20, 5000, 0)).toBe(1000);
    });

    it('fixed $5.00 charge', () => {
      expect(calculateServiceChargeAmount('fixed', 500, 10000, 0)).toBe(500);
    });
  });

  describe('Service Charge AFTER Discount', () => {
    it('18% on ($100 - $10 discount) = 18% of $90 = $16.20', () => {
      // This is the critical business rule:
      // Discounts reduce the base for service charges
      const amount = calculateServiceChargeAmount('percentage', 18, 10000, 1000);
      expect(amount).toBe(1620); // NOT 1800
    });

    it('20% on ($50 - $5 discount) = 20% of $45 = $9.00', () => {
      const amount = calculateServiceChargeAmount('percentage', 20, 5000, 500);
      expect(amount).toBe(900);
    });

    it('18% on ($25 - $25 discount) = 18% of $0 = $0', () => {
      const amount = calculateServiceChargeAmount('percentage', 18, 2500, 2500);
      expect(amount).toBe(0);
    });

    it('fixed charge unaffected by discount', () => {
      const amount = calculateServiceChargeAmount('fixed', 500, 10000, 1000);
      expect(amount).toBe(500); // Fixed charges don't depend on subtotal
    });
  });

  describe('Edge Cases', () => {
    it('0% service charge = $0', () => {
      expect(calculateServiceChargeAmount('percentage', 0, 10000, 0)).toBe(0);
    });

    it('service charge on $0.01 subtotal', () => {
      // 18% of 1 cent = round(0.18) = 0
      expect(calculateServiceChargeAmount('percentage', 18, 1, 0)).toBe(0);
    });

    it('service charge on large order ($9,999.99)', () => {
      const amount = calculateServiceChargeAmount('percentage', 18, 999999, 0);
      // 999999 * 18 / 100 = 179999.82 → rounds to 180000
      expect(amount).toBe(180000);
    });
  });
});
