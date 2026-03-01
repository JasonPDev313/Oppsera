// ══════════════════════════════════════════════════════════════════
// Spa Appointment Cancellation Fee Engine
// ══════════════════════════════════════════════════════════════════
//
// Pure business logic for calculating cancellation and no-show fees.
// No database access, no side effects — all functions are deterministic.
//
// Money convention: all amounts in INTEGER CENTS (same as orders/payments layer).
// Dollar config values are converted to cents at the calculation boundary.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CancellationConfig {
  /** Hours before appointment start that define the cancellation window (e.g., 24) */
  cancellationWindowHours: number;
  /** How the cancellation fee is calculated */
  cancellationFeeType: 'percentage' | 'flat' | 'none';
  /** Fee value: percentage (0-100) or dollar amount depending on feeType */
  cancellationFeeValue: number;
  /** How the no-show fee is calculated (defaults to 100% if not set) */
  noShowFeeType?: 'percentage' | 'flat' | 'none';
  /** No-show fee value: percentage (0-100) or dollar amount depending on feeType */
  noShowFeeValue?: number;
}

export interface CancellationInput {
  /** Scheduled start time of the appointment */
  appointmentStartAt: Date;
  /** When the cancellation was requested */
  canceledAt: Date;
  /** Total service price in cents */
  serviceTotalCents: number;
  /** Deposit already collected in cents */
  depositAmountCents: number;
  /** Whether the customer has an active membership */
  isMember: boolean;
  /** Membership tier slug (e.g., 'vip', 'platinum', 'gold') */
  memberTier?: string;
  /** Whether this is the customer's first cancellation (grace period) */
  isFirstCancellation: boolean;
  /** How the appointment was booked (e.g., 'online', 'phone', 'walk_in', 'kiosk') */
  bookingSource: string;
  /** Fee configuration to apply */
  config: CancellationConfig;
}

export interface CancellationResult {
  /** Calculated fee in cents (before waiver consideration) */
  feeCents: number;
  /** Which fee type was applied */
  feeType: 'percentage' | 'flat' | 'none';
  /** The rate/amount that was applied (percentage 0-100 or dollar amount) */
  rateApplied: number;
  /** Whether the cancellation fell inside the penalty window */
  isWithinWindow: boolean;
  /** Decimal hours between cancellation time and appointment start */
  hoursBeforeAppointment: number;
  /** Whether the fee was waived */
  isWaived: boolean;
  /** Reason the fee was waived (if applicable) */
  waivedReason?: string;
  /** Amount of the deposit to refund in cents */
  depositRefundCents: number;
  /** Additional amount to charge beyond the deposit (0 if deposit covers it) */
  netChargeCents: number;
}

export interface NoShowFeeResult {
  /** Calculated no-show fee in cents */
  feeCents: number;
  /** Which fee type was applied */
  feeType: 'percentage' | 'flat' | 'none';
}

export interface CancellationTier {
  /** Minimum hours before appointment for this tier (inclusive) */
  hoursBeforeMin: number;
  /** Maximum hours before appointment for this tier (exclusive), null = unlimited */
  hoursBeforeMax: number | null;
  /** Fee as a percentage of service total (0-100) */
  feePercentage: number;
}

// ---------------------------------------------------------------------------
// Member tiers that always receive fee waivers
// ---------------------------------------------------------------------------

const WAIVER_ELIGIBLE_TIERS = new Set(['vip', 'platinum']);

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Returns the difference in decimal hours between now and appointmentStartAt.
 * Positive = appointment is in the future. Negative = appointment has passed.
 */
export function getHoursUntilAppointment(appointmentStartAt: Date, now: Date): number {
  const diffMs = appointmentStartAt.getTime() - now.getTime();
  return diffMs / (1000 * 60 * 60);
}

/**
 * Returns true if canceledAt falls within the cancellation penalty window.
 * The window is the period of `windowHours` hours before the appointment start.
 */
export function isWithinCancellationWindow(
  appointmentStartAt: Date,
  canceledAt: Date,
  windowHours: number,
): boolean {
  const hoursUntil = getHoursUntilAppointment(appointmentStartAt, canceledAt);
  // Inside the window means: cancellation is less than windowHours before
  // the appointment (including after it has already started)
  return hoursUntil < windowHours;
}

/**
 * Returns sensible default cancellation configuration.
 * 24-hour window, no fee, no no-show fee.
 */
export function getDefaultCancellationConfig(): CancellationConfig {
  return {
    cancellationWindowHours: 24,
    cancellationFeeType: 'none',
    cancellationFeeValue: 0,
    noShowFeeType: 'none',
    noShowFeeValue: 0,
  };
}

/**
 * Determines whether a cancellation fee should be waived based on business rules.
 *
 * Waiver rules (checked in priority order):
 * 1. First cancellation grace — always waived on the first occurrence
 * 2. VIP/Platinum member exemption — high-tier members are never charged
 * 3. Walk-in bookings — no advance deposit, no penalty
 */
export function shouldWaiveCancellationFee(
  input: CancellationInput,
): { waived: boolean; reason?: string } {
  // Rule 1: first cancellation grace
  if (input.isFirstCancellation) {
    return { waived: true, reason: 'first_cancellation_grace' };
  }

  // Rule 2: VIP / Platinum member exemption
  if (input.isMember && input.memberTier && WAIVER_ELIGIBLE_TIERS.has(input.memberTier.toLowerCase())) {
    return { waived: true, reason: 'member_tier_exempt' };
  }

  // Rule 3: walk-in bookings have no advance commitment
  if (input.bookingSource === 'walk_in') {
    return { waived: true, reason: 'walk_in_no_deposit' };
  }

  return { waived: false };
}

/**
 * Calculates the raw fee in cents for a given fee type and value.
 */
function computeRawFeeCents(
  feeType: 'percentage' | 'flat' | 'none',
  feeValue: number,
  serviceTotalCents: number,
): number {
  switch (feeType) {
    case 'percentage':
      return Math.round(serviceTotalCents * feeValue / 100);
    case 'flat':
      // feeValue is in dollars — convert to cents
      return Math.round(feeValue * 100);
    case 'none':
      return 0;
  }
}

/**
 * Calculates the cancellation fee for an appointment.
 *
 * Logic:
 * - If cancellation is OUTSIDE the window (e.g., >24h before), fee is $0
 * - If cancellation is INSIDE the window, fee is calculated per config
 * - Waiver rules may override the fee to $0
 * - Deposit refund and net charge are derived from the final fee
 */
export function calculateCancellationFee(input: CancellationInput): CancellationResult {
  const { config, serviceTotalCents, depositAmountCents, appointmentStartAt, canceledAt } = input;

  const hoursBeforeAppointment = getHoursUntilAppointment(appointmentStartAt, canceledAt);
  const withinWindow = isWithinCancellationWindow(appointmentStartAt, canceledAt, config.cancellationWindowHours);

  // Outside the cancellation window — no fee
  if (!withinWindow) {
    return {
      feeCents: 0,
      feeType: 'none',
      rateApplied: 0,
      isWithinWindow: false,
      hoursBeforeAppointment,
      isWaived: false,
      depositRefundCents: depositAmountCents,
      netChargeCents: 0,
    };
  }

  // Inside the window — calculate the base fee
  const rawFeeCents = computeRawFeeCents(config.cancellationFeeType, config.cancellationFeeValue, serviceTotalCents);

  // Check waiver eligibility
  const waiver = shouldWaiveCancellationFee(input);

  const effectiveFeeCents = waiver.waived ? 0 : rawFeeCents;

  // Deposit math
  const depositRefundCents = Math.max(0, depositAmountCents - effectiveFeeCents);
  const netChargeCents = Math.max(0, effectiveFeeCents - depositAmountCents);

  return {
    feeCents: effectiveFeeCents,
    feeType: waiver.waived ? 'none' : config.cancellationFeeType,
    rateApplied: waiver.waived ? 0 : config.cancellationFeeValue,
    isWithinWindow: true,
    hoursBeforeAppointment,
    isWaived: waiver.waived,
    waivedReason: waiver.reason,
    depositRefundCents,
    netChargeCents,
  };
}

/**
 * Calculates a tiered cancellation fee based on how far in advance the
 * cancellation occurs.
 *
 * Tiers example:
 *   [ { hoursBeforeMin: 0,  hoursBeforeMax: 4,    feePercentage: 100 },
 *     { hoursBeforeMin: 4,  hoursBeforeMax: 12,   feePercentage: 75 },
 *     { hoursBeforeMin: 12, hoursBeforeMax: 24,   feePercentage: 50 },
 *     { hoursBeforeMin: 24, hoursBeforeMax: null,  feePercentage: 0 } ]
 *
 * Matching uses [hoursBeforeMin, hoursBeforeMax) — min is inclusive, max is exclusive.
 * A tier with hoursBeforeMax = null matches any value >= hoursBeforeMin.
 * If no tier matches, fee is $0 (fail-open).
 */
export function calculateTieredCancellationFee(
  input: CancellationInput,
  tiers: CancellationTier[],
): CancellationResult {
  const { serviceTotalCents, depositAmountCents, appointmentStartAt, canceledAt } = input;

  const hoursBeforeAppointment = getHoursUntilAppointment(appointmentStartAt, canceledAt);

  // Find the matching tier
  const matchingTier = tiers.find((tier) => {
    const aboveMin = hoursBeforeAppointment >= tier.hoursBeforeMin;
    const belowMax = tier.hoursBeforeMax === null || hoursBeforeAppointment < tier.hoursBeforeMax;
    return aboveMin && belowMax;
  });

  // No matching tier — no fee (fail-open)
  if (!matchingTier || matchingTier.feePercentage === 0) {
    return {
      feeCents: 0,
      feeType: 'none',
      rateApplied: 0,
      isWithinWindow: false,
      hoursBeforeAppointment,
      isWaived: false,
      depositRefundCents: depositAmountCents,
      netChargeCents: 0,
    };
  }

  // Calculate fee from the matched tier
  const rawFeeCents = Math.round(serviceTotalCents * matchingTier.feePercentage / 100);

  // Check waiver eligibility
  const waiver = shouldWaiveCancellationFee(input);

  const effectiveFeeCents = waiver.waived ? 0 : rawFeeCents;

  // Deposit math
  const depositRefundCents = Math.max(0, depositAmountCents - effectiveFeeCents);
  const netChargeCents = Math.max(0, effectiveFeeCents - depositAmountCents);

  return {
    feeCents: effectiveFeeCents,
    feeType: waiver.waived ? 'none' : 'percentage',
    rateApplied: waiver.waived ? 0 : matchingTier.feePercentage,
    isWithinWindow: true,
    hoursBeforeAppointment,
    isWaived: waiver.waived,
    waivedReason: waiver.reason,
    depositRefundCents,
    netChargeCents,
  };
}

/**
 * Calculates the no-show fee for an appointment.
 *
 * If noShowFeeType is not configured, defaults to 100% of service total.
 * No-shows are never waived — the customer did not communicate intent to cancel.
 */
export function calculateNoShowFee(
  serviceTotalCents: number,
  config: CancellationConfig,
): NoShowFeeResult {
  const feeType = config.noShowFeeType ?? 'percentage';
  const feeValue = config.noShowFeeValue ?? 100;

  // Explicitly configured as 'none'
  if (feeType === 'none') {
    return { feeCents: 0, feeType: 'none' };
  }

  const feeCents = computeRawFeeCents(feeType, feeValue, serviceTotalCents);

  return { feeCents, feeType };
}
