// ══════════════════════════════════════════════════════════════════
// Spa Appointment Deposit Rules — Pure Business Logic
// ══════════════════════════════════════════════════════════════════
//
// Pure functions for calculating deposit amounts, waiver eligibility,
// and refundable deposit balances. No database access — all inputs
// are passed in as arguments.
//
// Money convention: all amounts are INTEGER CENTS (never floating point).
// Dollar-based config values are converted to cents at the boundary.
// ══════════════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────────────

export interface DepositConfig {
  requireDeposit: boolean;
  depositType: 'percentage' | 'flat';
  depositValue: number; // percentage (0-100) or flat dollar amount
}

export interface DepositInput {
  serviceTotalCents: number;
  bookingSource: string; // front_desk, online, phone, mobile_app, kiosk, walk_in, pms
  isMember: boolean;
  memberTier?: string;
  config: DepositConfig;
  overrideAmountCents?: number; // manual override
}

export interface DepositResult {
  required: boolean;
  amountCents: number;
  depositType: 'percentage' | 'flat';
  rateApplied: number;
  waived: boolean;
  waivedReason?: string;
}

// ── Booking sources that automatically waive deposits ────────────

/**
 * Booking sources where deposits are waived by default.
 * Walk-ins always waive (no opportunity to collect upfront).
 * Front desk waives because staff can collect at point of service.
 */
const _DEPOSIT_WAIVED_SOURCES = new Set<string>([
  'walk_in',
  'front_desk',
]);

/**
 * Member tiers that qualify for automatic deposit waiver.
 * Platinum and VIP members have established trust / billing relationships.
 */
const DEPOSIT_WAIVED_MEMBER_TIERS = new Set<string>([
  'platinum',
  'vip',
]);

// ── Main Functions ──────────────────────────────────────────────

/**
 * Calculate the deposit amount for a spa appointment.
 *
 * Rules (evaluated in order):
 *   1. If config.requireDeposit is false, no deposit is required.
 *   2. If the deposit is waived (source or member tier), amount is 0.
 *   3. If an override amount is provided, use that directly.
 *   4. Calculate based on depositType (percentage or flat).
 *   5. Clamp: deposit never exceeds the service total.
 *   6. Clamp: deposit is never negative.
 */
export function calculateDeposit(input: DepositInput): DepositResult {
  const { config, serviceTotalCents, overrideAmountCents } = input;

  // 1. Config says no deposit required
  if (!config.requireDeposit) {
    return {
      required: false,
      amountCents: 0,
      depositType: config.depositType,
      rateApplied: 0,
      waived: false,
    };
  }

  // 2. Check waiver eligibility
  const waiver = shouldWaiveDeposit(input);
  if (waiver.waived) {
    return {
      required: false,
      amountCents: 0,
      depositType: config.depositType,
      rateApplied: config.depositValue,
      waived: true,
      waivedReason: waiver.reason,
    };
  }

  // 3. Manual override
  if (overrideAmountCents != null) {
    const clamped = clampDeposit(overrideAmountCents, serviceTotalCents);
    return {
      required: true,
      amountCents: clamped,
      depositType: config.depositType,
      rateApplied: config.depositValue,
      waived: false,
    };
  }

  // 4. Calculate based on type
  let amountCents: number;

  if (config.depositType === 'percentage') {
    // Percentage of service total — use integer math via Math.round
    amountCents = Math.round(serviceTotalCents * config.depositValue / 100);
  } else {
    // Flat dollar amount — convert dollars to cents
    amountCents = Math.round(config.depositValue * 100);
  }

  // 5 + 6. Clamp to [0, serviceTotalCents]
  amountCents = clampDeposit(amountCents, serviceTotalCents);

  return {
    required: true,
    amountCents,
    depositType: config.depositType,
    rateApplied: config.depositValue,
    waived: false,
  };
}

/**
 * Determine whether the deposit should be waived for this booking.
 *
 * Waiver rules (first match wins):
 *   - Walk-in bookings: always waived (no opportunity to collect upfront).
 *   - Front desk bookings: waived (staff collects payment at point of service).
 *   - Member bookings with platinum or VIP tier: waived (trusted relationship).
 *   - All other sources (online, phone, kiosk, mobile_app, pms): deposit required per config.
 */
export function shouldWaiveDeposit(input: DepositInput): { waived: boolean; reason?: string } {
  const { bookingSource, isMember, memberTier } = input;

  // Walk-in: always waive
  if (bookingSource === 'walk_in') {
    return { waived: true, reason: 'Walk-in booking — deposit not applicable' };
  }

  // Front desk: staff handles payment directly
  if (bookingSource === 'front_desk') {
    return { waived: true, reason: 'Front desk booking — deposit collected at point of service' };
  }

  // Member with qualifying tier
  if (isMember && memberTier && DEPOSIT_WAIVED_MEMBER_TIERS.has(memberTier.toLowerCase())) {
    return { waived: true, reason: `Member tier '${memberTier}' qualifies for deposit waiver` };
  }

  // No waiver
  return { waived: false };
}

/**
 * Calculate the refundable portion of a deposit after applying a cancellation fee.
 *
 * refundable = deposit - cancellationFee, clamped to >= 0.
 * All amounts are in cents.
 */
export function calculateRefundableDeposit(
  depositAmountCents: number,
  cancellationFeeCents: number,
): number {
  return Math.max(0, depositAmountCents - cancellationFeeCents);
}

/**
 * Returns sensible default deposit configuration.
 *
 * Defaults to deposits not required. Tenants enable and configure
 * deposits in their spa settings.
 */
export function getDefaultDepositConfig(): DepositConfig {
  return {
    requireDeposit: false,
    depositType: 'percentage',
    depositValue: 50,
  };
}

// ── Internal Helpers ────────────────────────────────────────────

/**
 * Clamp a deposit amount to [0, serviceTotalCents].
 * Deposit should never be negative or exceed the service total.
 */
function clampDeposit(amountCents: number, serviceTotalCents: number): number {
  if (amountCents < 0) return 0;
  if (amountCents > serviceTotalCents) return serviceTotalCents;
  return amountCents;
}
