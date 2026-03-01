import { describe, it, expect } from 'vitest';

import {
  calculateDeposit,
  shouldWaiveDeposit,
  calculateRefundableDeposit,
  getDefaultDepositConfig,
  type DepositInput,
} from '../helpers/deposit-rules';

import {
  getHoursUntilAppointment,
  isWithinCancellationWindow,
  calculateCancellationFee,
  calculateTieredCancellationFee,
  calculateNoShowFee,
  shouldWaiveCancellationFee,
  getDefaultCancellationConfig,
  type CancellationConfig,
  type CancellationInput,
  type CancellationTier,
} from '../helpers/cancellation-engine';

// ═══════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════

function makeDepositInput(overrides: Partial<DepositInput> = {}): DepositInput {
  return {
    serviceTotalCents: 10000, // $100.00
    bookingSource: 'online',
    isMember: false,
    config: {
      requireDeposit: true,
      depositType: 'percentage',
      depositValue: 50,
    },
    ...overrides,
  };
}

function makeCancellationConfig(overrides: Partial<CancellationConfig> = {}): CancellationConfig {
  return {
    cancellationWindowHours: 24,
    cancellationFeeType: 'percentage',
    cancellationFeeValue: 50,
    ...overrides,
  };
}

function makeCancellationInput(overrides: Partial<CancellationInput> = {}): CancellationInput {
  const appointmentStartAt = new Date('2026-03-15T14:00:00Z');
  // Default: cancel 6 hours before (within 24h window)
  const canceledAt = new Date('2026-03-15T08:00:00Z');

  return {
    appointmentStartAt,
    canceledAt,
    serviceTotalCents: 10000, // $100.00
    depositAmountCents: 5000, // $50.00
    isMember: false,
    isFirstCancellation: false,
    bookingSource: 'online',
    config: makeCancellationConfig(),
    ...overrides,
  };
}

/** Helper: offset a date by hours (positive = future, negative = past) */
function hoursFromDate(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

// ═══════════════════════════════════════════════════════════════════
// Deposit Rules — calculateDeposit
// ═══════════════════════════════════════════════════════════════════

describe('calculateDeposit', () => {
  it('returns no deposit when config.requireDeposit is false', () => {
    const result = calculateDeposit(
      makeDepositInput({
        config: { requireDeposit: false, depositType: 'percentage', depositValue: 50 },
      }),
    );
    expect(result.required).toBe(false);
    expect(result.amountCents).toBe(0);
    expect(result.waived).toBe(false);
  });

  it('calculates a flat dollar deposit ($50 flat on $200 service)', () => {
    const result = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 20000,
        config: { requireDeposit: true, depositType: 'flat', depositValue: 50 },
      }),
    );
    expect(result.required).toBe(true);
    expect(result.amountCents).toBe(5000); // $50 in cents
    expect(result.depositType).toBe('flat');
    expect(result.rateApplied).toBe(50);
  });

  it('calculates a percentage deposit (25% of $200)', () => {
    const result = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 20000,
        config: { requireDeposit: true, depositType: 'percentage', depositValue: 25 },
      }),
    );
    expect(result.required).toBe(true);
    expect(result.amountCents).toBe(5000); // 25% of 20000 = 5000
    expect(result.depositType).toBe('percentage');
  });

  it('calculates full payment required (100% deposit)', () => {
    const result = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 15000,
        config: { requireDeposit: true, depositType: 'percentage', depositValue: 100 },
      }),
    );
    expect(result.required).toBe(true);
    expect(result.amountCents).toBe(15000);
  });

  it('calculates zero deposit (0% percentage)', () => {
    const result = calculateDeposit(
      makeDepositInput({
        config: { requireDeposit: true, depositType: 'percentage', depositValue: 0 },
      }),
    );
    expect(result.required).toBe(true);
    expect(result.amountCents).toBe(0);
  });

  it('clamps deposit to service total when flat amount exceeds service price', () => {
    const result = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 3000, // $30
        config: { requireDeposit: true, depositType: 'flat', depositValue: 50 }, // $50
      }),
    );
    expect(result.amountCents).toBe(3000); // clamped to service total
  });

  it('clamps negative deposit to zero', () => {
    const result = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 10000,
        config: { requireDeposit: true, depositType: 'flat', depositValue: -10 },
      }),
    );
    expect(result.amountCents).toBe(0);
  });

  it('uses manual override amount when provided', () => {
    const result = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 20000,
        overrideAmountCents: 7500,
        config: { requireDeposit: true, depositType: 'percentage', depositValue: 50 },
      }),
    );
    expect(result.required).toBe(true);
    expect(result.amountCents).toBe(7500);
  });

  it('clamps manual override to service total', () => {
    const result = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 5000,
        overrideAmountCents: 9999,
        config: { requireDeposit: true, depositType: 'flat', depositValue: 50 },
      }),
    );
    expect(result.amountCents).toBe(5000);
  });

  it('clamps manual override to zero if negative', () => {
    const result = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 5000,
        overrideAmountCents: -100,
        config: { requireDeposit: true, depositType: 'flat', depositValue: 50 },
      }),
    );
    expect(result.amountCents).toBe(0);
  });

  it('produces integer cents with no floating-point drift (33.33%)', () => {
    // 33.33% of 10000 = 3333.0 exactly with Math.round
    const result = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 10000,
        config: { requireDeposit: true, depositType: 'percentage', depositValue: 33.33 },
      }),
    );
    expect(Number.isInteger(result.amountCents)).toBe(true);
    expect(result.amountCents).toBe(3333);
  });

  it('produces integer cents for 1/3 percentage on odd totals', () => {
    // 33% of 9999 = 3299.67 -> rounds to 3300
    const result = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 9999,
        config: { requireDeposit: true, depositType: 'percentage', depositValue: 33 },
      }),
    );
    expect(Number.isInteger(result.amountCents)).toBe(true);
    expect(result.amountCents).toBe(Math.round(9999 * 33 / 100));
  });

  it('handles multiple services totaling correctly ($75 + $125 = $200, 25% deposit)', () => {
    const totalCents = 7500 + 12500; // $200
    const result = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: totalCents,
        config: { requireDeposit: true, depositType: 'percentage', depositValue: 25 },
      }),
    );
    expect(result.amountCents).toBe(5000); // 25% of 20000
  });

  it('waives deposit for walk-in booking source', () => {
    const result = calculateDeposit(
      makeDepositInput({
        bookingSource: 'walk_in',
      }),
    );
    expect(result.required).toBe(false);
    expect(result.amountCents).toBe(0);
    expect(result.waived).toBe(true);
    expect(result.waivedReason).toContain('Walk-in');
  });

  it('waives deposit for front desk booking source', () => {
    const result = calculateDeposit(
      makeDepositInput({
        bookingSource: 'front_desk',
      }),
    );
    expect(result.required).toBe(false);
    expect(result.amountCents).toBe(0);
    expect(result.waived).toBe(true);
  });

  it('does not waive deposit for online booking', () => {
    const result = calculateDeposit(
      makeDepositInput({
        bookingSource: 'online',
      }),
    );
    expect(result.required).toBe(true);
    expect(result.waived).toBe(false);
  });

  it('waives deposit for VIP member', () => {
    const result = calculateDeposit(
      makeDepositInput({
        isMember: true,
        memberTier: 'vip',
        bookingSource: 'online',
      }),
    );
    expect(result.waived).toBe(true);
    expect(result.amountCents).toBe(0);
    expect(result.waivedReason).toContain('vip');
  });

  it('waives deposit for Platinum member (case-insensitive)', () => {
    const result = calculateDeposit(
      makeDepositInput({
        isMember: true,
        memberTier: 'Platinum',
        bookingSource: 'phone',
      }),
    );
    expect(result.waived).toBe(true);
  });

  it('does NOT waive deposit for Gold member', () => {
    const result = calculateDeposit(
      makeDepositInput({
        isMember: true,
        memberTier: 'gold',
        bookingSource: 'online',
      }),
    );
    expect(result.waived).toBe(false);
    expect(result.required).toBe(true);
    expect(result.amountCents).toBeGreaterThan(0);
  });

  it('does NOT waive for non-member even with memberTier set', () => {
    const result = calculateDeposit(
      makeDepositInput({
        isMember: false,
        memberTier: 'vip',
        bookingSource: 'online',
      }),
    );
    expect(result.waived).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Deposit Rules — shouldWaiveDeposit
// ═══════════════════════════════════════════════════════════════════

describe('shouldWaiveDeposit', () => {
  it('waives for walk-in bookings', () => {
    const result = shouldWaiveDeposit(makeDepositInput({ bookingSource: 'walk_in' }));
    expect(result.waived).toBe(true);
    expect(result.reason).toBeDefined();
  });

  it('waives for front desk bookings', () => {
    const result = shouldWaiveDeposit(makeDepositInput({ bookingSource: 'front_desk' }));
    expect(result.waived).toBe(true);
  });

  it('waives for VIP member on online booking', () => {
    const result = shouldWaiveDeposit(
      makeDepositInput({ isMember: true, memberTier: 'vip', bookingSource: 'online' }),
    );
    expect(result.waived).toBe(true);
    expect(result.reason).toContain('vip');
  });

  it('waives for Platinum member on phone booking', () => {
    const result = shouldWaiveDeposit(
      makeDepositInput({ isMember: true, memberTier: 'platinum', bookingSource: 'phone' }),
    );
    expect(result.waived).toBe(true);
  });

  it('does NOT waive for Gold member on online booking', () => {
    const result = shouldWaiveDeposit(
      makeDepositInput({ isMember: true, memberTier: 'gold', bookingSource: 'online' }),
    );
    expect(result.waived).toBe(false);
  });

  it('does NOT waive for non-member on online booking', () => {
    const result = shouldWaiveDeposit(
      makeDepositInput({ isMember: false, bookingSource: 'online' }),
    );
    expect(result.waived).toBe(false);
  });

  it('does NOT waive for kiosk booking without qualifying tier', () => {
    const result = shouldWaiveDeposit(
      makeDepositInput({ isMember: false, bookingSource: 'kiosk' }),
    );
    expect(result.waived).toBe(false);
  });

  it('does NOT waive for member without a tier set', () => {
    const result = shouldWaiveDeposit(
      makeDepositInput({ isMember: true, memberTier: undefined, bookingSource: 'online' }),
    );
    expect(result.waived).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Deposit Rules — calculateRefundableDeposit
// ═══════════════════════════════════════════════════════════════════

describe('calculateRefundableDeposit', () => {
  it('full refund when cancellation fee is zero', () => {
    expect(calculateRefundableDeposit(5000, 0)).toBe(5000);
  });

  it('partial refund when fee is less than deposit', () => {
    expect(calculateRefundableDeposit(5000, 2000)).toBe(3000);
  });

  it('no refund when fee equals deposit', () => {
    expect(calculateRefundableDeposit(5000, 5000)).toBe(0);
  });

  it('no refund when fee exceeds deposit (clamps to 0)', () => {
    expect(calculateRefundableDeposit(5000, 8000)).toBe(0);
  });

  it('returns 0 when both deposit and fee are 0', () => {
    expect(calculateRefundableDeposit(0, 0)).toBe(0);
  });

  it('returns integer cents', () => {
    const result = calculateRefundableDeposit(3333, 1111);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(2222);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Deposit Rules — getDefaultDepositConfig
// ═══════════════════════════════════════════════════════════════════

describe('getDefaultDepositConfig', () => {
  it('returns a valid DepositConfig', () => {
    const config = getDefaultDepositConfig();
    expect(config).toHaveProperty('requireDeposit');
    expect(config).toHaveProperty('depositType');
    expect(config).toHaveProperty('depositValue');
  });

  it('defaults to deposits not required', () => {
    const config = getDefaultDepositConfig();
    expect(config.requireDeposit).toBe(false);
  });

  it('has a reasonable depositValue', () => {
    const config = getDefaultDepositConfig();
    expect(config.depositValue).toBeGreaterThanOrEqual(0);
    expect(config.depositValue).toBeLessThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Cancellation Engine — getHoursUntilAppointment
// ═══════════════════════════════════════════════════════════════════

describe('getHoursUntilAppointment', () => {
  const base = new Date('2026-03-15T14:00:00Z');

  it('returns positive hours for a future appointment', () => {
    const now = hoursFromDate(base, -6); // 6h before appointment
    expect(getHoursUntilAppointment(base, now)).toBe(6);
  });

  it('returns negative hours for a past appointment', () => {
    const now = hoursFromDate(base, 3); // 3h after appointment
    expect(getHoursUntilAppointment(base, now)).toBe(-3);
  });

  it('returns 0 when now equals appointment start', () => {
    expect(getHoursUntilAppointment(base, base)).toBe(0);
  });

  it('returns exactly 24 for a full day ahead', () => {
    const now = hoursFromDate(base, -24);
    expect(getHoursUntilAppointment(base, now)).toBe(24);
  });

  it('returns fractional hours for same-day offsets', () => {
    const now = hoursFromDate(base, -1.5); // 90 minutes before
    expect(getHoursUntilAppointment(base, now)).toBe(1.5);
  });

  it('returns precise fractional hours for 30 minutes', () => {
    const now = hoursFromDate(base, -0.5);
    expect(getHoursUntilAppointment(base, now)).toBe(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Cancellation Engine — isWithinCancellationWindow
// ═══════════════════════════════════════════════════════════════════

describe('isWithinCancellationWindow', () => {
  const appointment = new Date('2026-03-15T14:00:00Z');

  it('returns true when cancelled 6h before a 24h window', () => {
    const canceledAt = hoursFromDate(appointment, -6);
    expect(isWithinCancellationWindow(appointment, canceledAt, 24)).toBe(true);
  });

  it('returns false when cancelled 48h before a 24h window', () => {
    const canceledAt = hoursFromDate(appointment, -48);
    expect(isWithinCancellationWindow(appointment, canceledAt, 24)).toBe(false);
  });

  it('returns true when cancelled after appointment has started', () => {
    const canceledAt = hoursFromDate(appointment, 1); // 1h after start
    expect(isWithinCancellationWindow(appointment, canceledAt, 24)).toBe(true);
  });

  it('returns false when exactly at boundary (hours == windowHours)', () => {
    // hoursUntil = 24, windowHours = 24 -> 24 < 24 is false -> outside window
    const canceledAt = hoursFromDate(appointment, -24);
    expect(isWithinCancellationWindow(appointment, canceledAt, 24)).toBe(false);
  });

  it('returns true when just inside boundary (23.99h before a 24h window)', () => {
    const canceledAt = hoursFromDate(appointment, -23.99);
    expect(isWithinCancellationWindow(appointment, canceledAt, 24)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Cancellation Engine — calculateCancellationFee
// ═══════════════════════════════════════════════════════════════════

describe('calculateCancellationFee', () => {
  it('returns $0 fee when cancelled outside the window', () => {
    const result = calculateCancellationFee(
      makeCancellationInput({
        canceledAt: hoursFromDate(new Date('2026-03-15T14:00:00Z'), -48), // 48h before
      }),
    );
    expect(result.feeCents).toBe(0);
    expect(result.isWithinWindow).toBe(false);
    expect(result.depositRefundCents).toBe(5000); // full deposit refunded
    expect(result.netChargeCents).toBe(0);
  });

  it('returns percentage fee when cancelled inside the window', () => {
    const result = calculateCancellationFee(
      makeCancellationInput({
        // Default: 6h before, 24h window, 50% fee on $100 service
      }),
    );
    expect(result.feeCents).toBe(5000); // 50% of 10000
    expect(result.isWithinWindow).toBe(true);
    expect(result.feeType).toBe('percentage');
    expect(result.rateApplied).toBe(50);
  });

  it('returns flat dollar fee when configured', () => {
    const result = calculateCancellationFee(
      makeCancellationInput({
        config: makeCancellationConfig({
          cancellationFeeType: 'flat',
          cancellationFeeValue: 25, // $25
        }),
      }),
    );
    expect(result.feeCents).toBe(2500); // $25 in cents
    expect(result.feeType).toBe('flat');
  });

  it('returns $0 fee when feeType is none', () => {
    const result = calculateCancellationFee(
      makeCancellationInput({
        config: makeCancellationConfig({
          cancellationFeeType: 'none',
          cancellationFeeValue: 0,
        }),
      }),
    );
    expect(result.feeCents).toBe(0);
  });

  it('calculates deposit refund when fee is less than deposit', () => {
    const result = calculateCancellationFee(
      makeCancellationInput({
        serviceTotalCents: 20000,
        depositAmountCents: 10000,
        config: makeCancellationConfig({
          cancellationFeeType: 'percentage',
          cancellationFeeValue: 25, // 25% of 20000 = 5000
        }),
      }),
    );
    expect(result.feeCents).toBe(5000);
    expect(result.depositRefundCents).toBe(5000); // 10000 - 5000
    expect(result.netChargeCents).toBe(0);
  });

  it('calculates net charge when fee exceeds deposit', () => {
    const result = calculateCancellationFee(
      makeCancellationInput({
        serviceTotalCents: 20000,
        depositAmountCents: 2000, // small deposit
        config: makeCancellationConfig({
          cancellationFeeType: 'percentage',
          cancellationFeeValue: 50, // 50% of 20000 = 10000
        }),
      }),
    );
    expect(result.feeCents).toBe(10000);
    expect(result.depositRefundCents).toBe(0);
    expect(result.netChargeCents).toBe(8000); // 10000 - 2000
  });

  it('produces integer cents for percentage fee', () => {
    const result = calculateCancellationFee(
      makeCancellationInput({
        serviceTotalCents: 9999,
        config: makeCancellationConfig({
          cancellationFeeType: 'percentage',
          cancellationFeeValue: 33,
        }),
      }),
    );
    expect(Number.isInteger(result.feeCents)).toBe(true);
  });

  it('reports hoursBeforeAppointment correctly', () => {
    const appointment = new Date('2026-03-15T14:00:00Z');
    const canceledAt = hoursFromDate(appointment, -10);
    const result = calculateCancellationFee(
      makeCancellationInput({ appointmentStartAt: appointment, canceledAt }),
    );
    expect(result.hoursBeforeAppointment).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Cancellation Engine — calculateTieredCancellationFee
// ═══════════════════════════════════════════════════════════════════

describe('calculateTieredCancellationFee', () => {
  const STANDARD_TIERS: CancellationTier[] = [
    { hoursBeforeMin: 0, hoursBeforeMax: 4, feePercentage: 100 },
    { hoursBeforeMin: 4, hoursBeforeMax: 12, feePercentage: 75 },
    { hoursBeforeMin: 12, hoursBeforeMax: 24, feePercentage: 50 },
    { hoursBeforeMin: 24, hoursBeforeMax: null, feePercentage: 0 },
  ];

  it('applies highest fee when cancelled very late (0-4h)', () => {
    const appointment = new Date('2026-03-15T14:00:00Z');
    const canceledAt = hoursFromDate(appointment, -2); // 2h before
    const result = calculateTieredCancellationFee(
      makeCancellationInput({ appointmentStartAt: appointment, canceledAt }),
      STANDARD_TIERS,
    );
    expect(result.feeCents).toBe(10000); // 100% of 10000
    expect(result.rateApplied).toBe(100);
    expect(result.isWithinWindow).toBe(true);
  });

  it('applies medium fee for 4-12h tier (75%)', () => {
    const appointment = new Date('2026-03-15T14:00:00Z');
    const canceledAt = hoursFromDate(appointment, -8); // 8h before
    const result = calculateTieredCancellationFee(
      makeCancellationInput({ appointmentStartAt: appointment, canceledAt }),
      STANDARD_TIERS,
    );
    expect(result.feeCents).toBe(7500); // 75% of 10000
    expect(result.rateApplied).toBe(75);
  });

  it('applies lower fee for 12-24h tier (50%)', () => {
    const appointment = new Date('2026-03-15T14:00:00Z');
    const canceledAt = hoursFromDate(appointment, -18); // 18h before
    const result = calculateTieredCancellationFee(
      makeCancellationInput({ appointmentStartAt: appointment, canceledAt }),
      STANDARD_TIERS,
    );
    expect(result.feeCents).toBe(5000); // 50% of 10000
    expect(result.rateApplied).toBe(50);
  });

  it('returns $0 fee when cancelled more than 24h before (0% tier)', () => {
    const appointment = new Date('2026-03-15T14:00:00Z');
    const canceledAt = hoursFromDate(appointment, -48); // 48h before
    const result = calculateTieredCancellationFee(
      makeCancellationInput({ appointmentStartAt: appointment, canceledAt }),
      STANDARD_TIERS,
    );
    expect(result.feeCents).toBe(0);
    expect(result.isWithinWindow).toBe(false);
    expect(result.depositRefundCents).toBe(5000); // full deposit back
  });

  it('matches tier boundary correctly (exactly 4h = middle tier, not highest)', () => {
    const appointment = new Date('2026-03-15T14:00:00Z');
    const canceledAt = hoursFromDate(appointment, -4); // exactly 4h before
    // hoursBeforeMin=4, hoursBeforeMax=12 -> 4 >= 4 && 4 < 12 -> match
    const result = calculateTieredCancellationFee(
      makeCancellationInput({ appointmentStartAt: appointment, canceledAt }),
      STANDARD_TIERS,
    );
    expect(result.rateApplied).toBe(75); // 4-12h tier
  });

  it('matches tier boundary correctly (exactly 12h = lower tier)', () => {
    const appointment = new Date('2026-03-15T14:00:00Z');
    const canceledAt = hoursFromDate(appointment, -12);
    const result = calculateTieredCancellationFee(
      makeCancellationInput({ appointmentStartAt: appointment, canceledAt }),
      STANDARD_TIERS,
    );
    expect(result.rateApplied).toBe(50); // 12-24h tier
  });

  it('returns $0 when no tier matches (empty tiers array)', () => {
    const result = calculateTieredCancellationFee(
      makeCancellationInput(),
      [],
    );
    expect(result.feeCents).toBe(0);
    expect(result.isWithinWindow).toBe(false);
  });

  it('handles cancellation after appointment has started (negative hours)', () => {
    const appointment = new Date('2026-03-15T14:00:00Z');
    const canceledAt = hoursFromDate(appointment, 1); // 1h AFTER start
    // hoursUntil = -1 -> matches 0-4h tier (hoursBeforeMin=0 is satisfied because -1 >= 0 is FALSE)
    // Actually -1 >= 0 is false, so 0-4h tier won't match either
    // No tier matches for negative hours in STANDARD_TIERS
    const result = calculateTieredCancellationFee(
      makeCancellationInput({ appointmentStartAt: appointment, canceledAt }),
      STANDARD_TIERS,
    );
    // With standard tiers, negative hours match no tier -> fail-open $0
    expect(result.feeCents).toBe(0);
  });

  it('handles negative hours with a tier that covers them', () => {
    const tiersWithNegative: CancellationTier[] = [
      { hoursBeforeMin: -999, hoursBeforeMax: 4, feePercentage: 100 },
      { hoursBeforeMin: 4, hoursBeforeMax: null, feePercentage: 0 },
    ];
    const appointment = new Date('2026-03-15T14:00:00Z');
    const canceledAt = hoursFromDate(appointment, 1); // 1h after
    const result = calculateTieredCancellationFee(
      makeCancellationInput({ appointmentStartAt: appointment, canceledAt }),
      tiersWithNegative,
    );
    expect(result.feeCents).toBe(10000); // 100%
  });

  it('calculates deposit refund and net charge correctly', () => {
    const appointment = new Date('2026-03-15T14:00:00Z');
    const canceledAt = hoursFromDate(appointment, -2); // highest tier: 100%
    const result = calculateTieredCancellationFee(
      makeCancellationInput({
        appointmentStartAt: appointment,
        canceledAt,
        serviceTotalCents: 10000,
        depositAmountCents: 3000,
      }),
      STANDARD_TIERS,
    );
    expect(result.feeCents).toBe(10000);
    expect(result.depositRefundCents).toBe(0);
    expect(result.netChargeCents).toBe(7000); // 10000 - 3000
  });

  it('produces integer cents for tiered fee', () => {
    const appointment = new Date('2026-03-15T14:00:00Z');
    const canceledAt = hoursFromDate(appointment, -8);
    const result = calculateTieredCancellationFee(
      makeCancellationInput({
        appointmentStartAt: appointment,
        canceledAt,
        serviceTotalCents: 9999,
      }),
      STANDARD_TIERS,
    );
    expect(Number.isInteger(result.feeCents)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Cancellation Engine — calculateNoShowFee
// ═══════════════════════════════════════════════════════════════════

describe('calculateNoShowFee', () => {
  it('defaults to 100% of service total when noShowFee not configured', () => {
    const result = calculateNoShowFee(10000, {
      cancellationWindowHours: 24,
      cancellationFeeType: 'percentage',
      cancellationFeeValue: 50,
      // noShowFeeType and noShowFeeValue not set
    });
    expect(result.feeCents).toBe(10000); // 100% of 10000
    expect(result.feeType).toBe('percentage');
  });

  it('calculates percentage no-show fee', () => {
    const result = calculateNoShowFee(10000, makeCancellationConfig({
      noShowFeeType: 'percentage',
      noShowFeeValue: 75,
    }));
    expect(result.feeCents).toBe(7500);
    expect(result.feeType).toBe('percentage');
  });

  it('calculates flat dollar no-show fee', () => {
    const result = calculateNoShowFee(10000, makeCancellationConfig({
      noShowFeeType: 'flat',
      noShowFeeValue: 30, // $30
    }));
    expect(result.feeCents).toBe(3000);
    expect(result.feeType).toBe('flat');
  });

  it('returns $0 when noShowFeeType is none', () => {
    const result = calculateNoShowFee(10000, makeCancellationConfig({
      noShowFeeType: 'none',
      noShowFeeValue: 0,
    }));
    expect(result.feeCents).toBe(0);
    expect(result.feeType).toBe('none');
  });

  it('produces integer cents for percentage no-show fee on odd total', () => {
    const result = calculateNoShowFee(9999, makeCancellationConfig({
      noShowFeeType: 'percentage',
      noShowFeeValue: 33,
    }));
    expect(Number.isInteger(result.feeCents)).toBe(true);
    expect(result.feeCents).toBe(Math.round(9999 * 33 / 100));
  });
});

// ═══════════════════════════════════════════════════════════════════
// Cancellation Engine — shouldWaiveCancellationFee
// ═══════════════════════════════════════════════════════════════════

describe('shouldWaiveCancellationFee', () => {
  it('waives for first cancellation (grace period)', () => {
    const result = shouldWaiveCancellationFee(
      makeCancellationInput({ isFirstCancellation: true }),
    );
    expect(result.waived).toBe(true);
    expect(result.reason).toBe('first_cancellation_grace');
  });

  it('waives for VIP member', () => {
    const result = shouldWaiveCancellationFee(
      makeCancellationInput({ isMember: true, memberTier: 'vip' }),
    );
    expect(result.waived).toBe(true);
    expect(result.reason).toBe('member_tier_exempt');
  });

  it('waives for Platinum member (case-insensitive)', () => {
    const result = shouldWaiveCancellationFee(
      makeCancellationInput({ isMember: true, memberTier: 'Platinum' }),
    );
    expect(result.waived).toBe(true);
    expect(result.reason).toBe('member_tier_exempt');
  });

  it('waives for walk-in booking', () => {
    const result = shouldWaiveCancellationFee(
      makeCancellationInput({ bookingSource: 'walk_in' }),
    );
    expect(result.waived).toBe(true);
    expect(result.reason).toBe('walk_in_no_deposit');
  });

  it('does NOT waive for Gold member', () => {
    const result = shouldWaiveCancellationFee(
      makeCancellationInput({ isMember: true, memberTier: 'gold' }),
    );
    expect(result.waived).toBe(false);
  });

  it('does NOT waive for non-member repeat cancellation via online', () => {
    const result = shouldWaiveCancellationFee(
      makeCancellationInput({
        isMember: false,
        isFirstCancellation: false,
        bookingSource: 'online',
      }),
    );
    expect(result.waived).toBe(false);
  });

  it('first cancellation takes priority over member tier', () => {
    const result = shouldWaiveCancellationFee(
      makeCancellationInput({
        isFirstCancellation: true,
        isMember: true,
        memberTier: 'vip',
      }),
    );
    // First cancellation rule fires first
    expect(result.reason).toBe('first_cancellation_grace');
  });

  it('member tier takes priority over walk-in', () => {
    const result = shouldWaiveCancellationFee(
      makeCancellationInput({
        isMember: true,
        memberTier: 'platinum',
        bookingSource: 'walk_in',
        isFirstCancellation: false,
      }),
    );
    // Member tier rule fires before walk-in rule
    expect(result.reason).toBe('member_tier_exempt');
  });

  it('does NOT waive for member without tier set', () => {
    const result = shouldWaiveCancellationFee(
      makeCancellationInput({
        isMember: true,
        memberTier: undefined,
        isFirstCancellation: false,
        bookingSource: 'online',
      }),
    );
    expect(result.waived).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Cancellation Engine — getDefaultCancellationConfig
// ═══════════════════════════════════════════════════════════════════

describe('getDefaultCancellationConfig', () => {
  it('returns a valid CancellationConfig', () => {
    const config = getDefaultCancellationConfig();
    expect(config).toHaveProperty('cancellationWindowHours');
    expect(config).toHaveProperty('cancellationFeeType');
    expect(config).toHaveProperty('cancellationFeeValue');
  });

  it('defaults to a 24-hour window', () => {
    const config = getDefaultCancellationConfig();
    expect(config.cancellationWindowHours).toBe(24);
  });

  it('defaults to no cancellation fee', () => {
    const config = getDefaultCancellationConfig();
    expect(config.cancellationFeeType).toBe('none');
    expect(config.cancellationFeeValue).toBe(0);
  });

  it('defaults to no no-show fee', () => {
    const config = getDefaultCancellationConfig();
    expect(config.noShowFeeType).toBe('none');
    expect(config.noShowFeeValue).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Integration: Deposit + Cancellation combined scenarios
// ═══════════════════════════════════════════════════════════════════

describe('deposit + cancellation integration', () => {
  it('full lifecycle: deposit collected, cancellation fee deducted, partial refund', () => {
    // 1. Calculate deposit: 50% of $200 = $100
    const deposit = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 20000,
        config: { requireDeposit: true, depositType: 'percentage', depositValue: 50 },
      }),
    );
    expect(deposit.amountCents).toBe(10000);

    // 2. Cancel within window: 25% fee on $200 = $50
    const cancellation = calculateCancellationFee(
      makeCancellationInput({
        serviceTotalCents: 20000,
        depositAmountCents: deposit.amountCents,
        config: makeCancellationConfig({
          cancellationFeeType: 'percentage',
          cancellationFeeValue: 25,
        }),
      }),
    );
    expect(cancellation.feeCents).toBe(5000);

    // 3. Refundable deposit = $100 - $50 = $50
    const refund = calculateRefundableDeposit(deposit.amountCents, cancellation.feeCents);
    expect(refund).toBe(5000);

    // Verify consistency with CancellationResult
    expect(cancellation.depositRefundCents).toBe(5000);
    expect(cancellation.netChargeCents).toBe(0);
  });

  it('VIP member: deposit waived, cancellation fee waived', () => {
    const deposit = calculateDeposit(
      makeDepositInput({
        isMember: true,
        memberTier: 'vip',
        bookingSource: 'online',
      }),
    );
    expect(deposit.waived).toBe(true);
    expect(deposit.amountCents).toBe(0);

    const cancellation = calculateCancellationFee(
      makeCancellationInput({
        isMember: true,
        memberTier: 'vip',
        depositAmountCents: 0,
      }),
    );
    expect(cancellation.isWaived).toBe(true);
    expect(cancellation.feeCents).toBe(0);
    expect(cancellation.depositRefundCents).toBe(0);
    expect(cancellation.netChargeCents).toBe(0);
  });

  it('no-show after deposit: deposit forfeited as partial payment toward no-show fee', () => {
    const deposit = calculateDeposit(
      makeDepositInput({
        serviceTotalCents: 15000,
        config: { requireDeposit: true, depositType: 'percentage', depositValue: 50 },
      }),
    );
    expect(deposit.amountCents).toBe(7500);

    const noShow = calculateNoShowFee(15000, makeCancellationConfig({
      noShowFeeType: 'percentage',
      noShowFeeValue: 100,
    }));
    expect(noShow.feeCents).toBe(15000);

    // Deposit covers $75 of $150 no-show fee
    const refund = calculateRefundableDeposit(deposit.amountCents, noShow.feeCents);
    expect(refund).toBe(0); // nothing left to refund
  });
});
