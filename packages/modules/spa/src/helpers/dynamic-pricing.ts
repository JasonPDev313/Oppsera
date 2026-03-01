/**
 * Spa Dynamic Pricing Engine
 *
 * Pure helper (no DB access, no side effects) that calculates dynamic pricing
 * adjustments for spa services based on configurable rules.
 *
 * Similar to PMS `computeDynamicRate` — all functions are pure, deterministic,
 * and operate on integer cents to avoid floating-point drift.
 */

// ── Types ────────────────────────────────────────────────────────

export interface PricingConfig {
  /** Enable dynamic pricing */
  enabled: boolean;
  /** Peak hours: multiplier for busy times (e.g., 1.2 = 20% more) */
  peakMultiplier: number;
  /** Off-peak hours: multiplier for slow times (e.g., 0.85 = 15% off) */
  offPeakMultiplier: number;
  /** Peak hours of day (24hr format) */
  peakHours: number[];
  /** Off-peak hours of day (24hr format) */
  offPeakHours: number[];
  /** Day-of-week multipliers (0=Sun..6=Sat) */
  dayOfWeekMultipliers: Record<number, number>;
  /** High-demand threshold (0-1): when utilization exceeds this, apply demand surcharge */
  highDemandThreshold: number;
  /** High-demand surcharge multiplier */
  highDemandMultiplier: number;
  /** Low-demand threshold (0-1): when utilization below this, apply low-demand discount */
  lowDemandThreshold: number;
  /** Low-demand discount multiplier */
  lowDemandMultiplier: number;
  /** Minimum price floor (as fraction of base price, e.g. 0.7 = 70% minimum) */
  minPriceFloor: number;
  /** Maximum price ceiling (as fraction of base price, e.g. 1.5 = 150% max) */
  maxPriceCeiling: number;
  /** Lead time discount: same-day booking discount multiplier */
  sameDayDiscountMultiplier: number;
  /** Advance booking premium: >30 days in advance multiplier */
  advanceBookingMultiplier: number;
}

export interface PricingInput {
  /** Base price in cents (integer) */
  basePriceCents: number;
  /** Date/time of the appointment slot */
  slotDateTime: Date;
  /** Current date/time for lead time calculation */
  now: Date;
  /** Current utilization for the time slot (0-1) */
  currentUtilization: number;
  /** Provider-specific multiplier (e.g., senior stylist = 1.15) */
  providerMultiplier?: number;
}

export interface PricingResult {
  /** Final price in cents */
  finalPriceCents: number;
  /** Base price in cents (unchanged) */
  basePriceCents: number;
  /** Combined multiplier applied */
  combinedMultiplier: number;
  /** Breakdown of individual adjustments */
  adjustments: PricingAdjustment[];
}

export interface PricingAdjustment {
  type: 'time_of_day' | 'day_of_week' | 'demand' | 'lead_time' | 'provider';
  label: string;
  multiplier: number;
}

// ── Day labels for formatting ────────────────────────────────────

const DAY_LABELS: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

// ── Default Configuration ────────────────────────────────────────

/**
 * Returns sensible default pricing configuration.
 * Dynamic pricing is disabled by default (opt-in).
 */
export function getDefaultPricingConfig(): PricingConfig {
  return {
    enabled: false,
    peakMultiplier: 1.15,
    offPeakMultiplier: 0.90,
    peakHours: [10, 11, 14, 15, 16],
    offPeakHours: [8, 9, 18, 19],
    dayOfWeekMultipliers: { 0: 0.9, 6: 1.1 },
    highDemandThreshold: 0.85,
    highDemandMultiplier: 1.20,
    lowDemandThreshold: 0.30,
    lowDemandMultiplier: 0.85,
    minPriceFloor: 0.70,
    maxPriceCeiling: 1.50,
    sameDayDiscountMultiplier: 0.95,
    advanceBookingMultiplier: 1.0,
  };
}

// ── Individual Adjustment Functions ──────────────────────────────

/**
 * Returns the time-of-day adjustment based on the hour of the slot.
 * Returns null if the hour falls in neither peak nor off-peak (standard rate).
 */
export function getTimeOfDayAdjustment(
  config: PricingConfig,
  hour: number,
): PricingAdjustment | null {
  if (config.peakHours.includes(hour)) {
    return {
      type: 'time_of_day',
      label: `Peak hour (${hour}:00)`,
      multiplier: config.peakMultiplier,
    };
  }

  if (config.offPeakHours.includes(hour)) {
    return {
      type: 'time_of_day',
      label: `Off-peak hour (${hour}:00)`,
      multiplier: config.offPeakMultiplier,
    };
  }

  return null;
}

/**
 * Returns the day-of-week adjustment if configured for the given day.
 * Returns null if no multiplier is set for that day (standard rate).
 */
export function getDayOfWeekAdjustment(
  config: PricingConfig,
  dayOfWeek: number,
): PricingAdjustment | null {
  const multiplier = config.dayOfWeekMultipliers[dayOfWeek];
  if (multiplier == null || multiplier === 1.0) {
    return null;
  }

  const dayLabel = DAY_LABELS[dayOfWeek] ?? `Day ${dayOfWeek}`;
  const direction = multiplier > 1.0 ? 'premium' : 'discount';

  return {
    type: 'day_of_week',
    label: `${dayLabel} ${direction}`,
    multiplier,
  };
}

/**
 * Returns a demand-based adjustment based on current utilization vs thresholds.
 * Returns null if utilization is within normal range.
 */
export function getDemandAdjustment(
  config: PricingConfig,
  utilization: number,
): PricingAdjustment | null {
  // Clamp utilization to [0, 1]
  const clamped = Math.max(0, Math.min(1, utilization));

  if (clamped >= config.highDemandThreshold) {
    const pct = Math.round(clamped * 100);
    return {
      type: 'demand',
      label: `High demand (${pct}% utilization)`,
      multiplier: config.highDemandMultiplier,
    };
  }

  if (clamped <= config.lowDemandThreshold) {
    const pct = Math.round(clamped * 100);
    return {
      type: 'demand',
      label: `Low demand (${pct}% utilization)`,
      multiplier: config.lowDemandMultiplier,
    };
  }

  return null;
}

/**
 * Returns a lead-time adjustment based on how far in advance the booking is.
 * Same-day bookings get sameDayDiscountMultiplier.
 * Bookings more than 30 days out get advanceBookingMultiplier.
 * Returns null for bookings 1-30 days out (standard rate).
 */
export function getLeadTimeAdjustment(
  config: PricingConfig,
  slotDate: Date,
  now: Date,
): PricingAdjustment | null {
  const diffMs = slotDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // Same-day booking (slot is today or less than 1 day away)
  if (diffDays < 1) {
    if (config.sameDayDiscountMultiplier === 1.0) {
      return null;
    }
    return {
      type: 'lead_time',
      label: 'Same-day booking',
      multiplier: config.sameDayDiscountMultiplier,
    };
  }

  // Advance booking (more than 30 days out)
  if (diffDays > 30) {
    if (config.advanceBookingMultiplier === 1.0) {
      return null;
    }
    return {
      type: 'lead_time',
      label: 'Advance booking (30+ days)',
      multiplier: config.advanceBookingMultiplier,
    };
  }

  return null;
}

// ── Main Calculation ─────────────────────────────────────────────

/**
 * Calculates the dynamic price for a spa service.
 *
 * Pure function: no DB access, no side effects.
 * All arithmetic uses integer cents to avoid floating-point drift.
 *
 * When config.enabled is false, returns the base price with no adjustments.
 */
export function calculateDynamicPrice(
  config: PricingConfig,
  input: PricingInput,
): PricingResult {
  const { basePriceCents } = input;

  // When disabled, return base price unchanged
  if (!config.enabled) {
    return {
      finalPriceCents: basePriceCents,
      basePriceCents,
      combinedMultiplier: 1.0,
      adjustments: [],
    };
  }

  const adjustments: PricingAdjustment[] = [];

  // 1. Time-of-day adjustment
  const hour = input.slotDateTime.getHours();
  const timeAdj = getTimeOfDayAdjustment(config, hour);
  if (timeAdj) {
    adjustments.push(timeAdj);
  }

  // 2. Day-of-week adjustment
  const dayOfWeek = input.slotDateTime.getDay();
  const dayAdj = getDayOfWeekAdjustment(config, dayOfWeek);
  if (dayAdj) {
    adjustments.push(dayAdj);
  }

  // 3. Demand-based adjustment
  const demandAdj = getDemandAdjustment(config, input.currentUtilization);
  if (demandAdj) {
    adjustments.push(demandAdj);
  }

  // 4. Lead-time adjustment
  const leadAdj = getLeadTimeAdjustment(config, input.slotDateTime, input.now);
  if (leadAdj) {
    adjustments.push(leadAdj);
  }

  // 5. Provider multiplier
  if (input.providerMultiplier != null && input.providerMultiplier !== 1.0) {
    adjustments.push({
      type: 'provider',
      label: `Provider rate adjustment`,
      multiplier: input.providerMultiplier,
    });
  }

  // Multiply all adjustments together
  let combinedMultiplier = 1.0;
  for (const adj of adjustments) {
    combinedMultiplier *= adj.multiplier;
  }

  // Clamp to price floor/ceiling (as fraction of base)
  combinedMultiplier = Math.max(config.minPriceFloor, combinedMultiplier);
  combinedMultiplier = Math.min(config.maxPriceCeiling, combinedMultiplier);

  // Compute final price in cents — round to nearest integer
  const finalPriceCents = Math.round(basePriceCents * combinedMultiplier);

  return {
    finalPriceCents,
    basePriceCents,
    combinedMultiplier,
    adjustments,
  };
}

// ── Formatting ───────────────────────────────────────────────────

/**
 * Returns a human-readable breakdown string of the pricing result.
 */
export function formatPricingBreakdown(result: PricingResult): string {
  const lines: string[] = [];

  lines.push(`Base price: $${(result.basePriceCents / 100).toFixed(2)}`);

  if (result.adjustments.length === 0) {
    lines.push('No adjustments applied (standard rate)');
  } else {
    lines.push('Adjustments:');
    for (const adj of result.adjustments) {
      const pct = ((adj.multiplier - 1) * 100).toFixed(1);
      const sign = adj.multiplier >= 1 ? '+' : '';
      lines.push(`  ${adj.label}: ${sign}${pct}% (x${adj.multiplier.toFixed(3)})`);
    }
    lines.push(`Combined multiplier: x${result.combinedMultiplier.toFixed(3)}`);
  }

  lines.push(`Final price: $${(result.finalPriceCents / 100).toFixed(2)}`);

  return lines.join('\n');
}
