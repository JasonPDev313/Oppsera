import { describe, it, expect } from 'vitest';
import {
  getDefaultPricingConfig,
  getTimeOfDayAdjustment,
  getDayOfWeekAdjustment,
  getDemandAdjustment,
  getLeadTimeAdjustment,
  calculateDynamicPrice,
  formatPricingBreakdown,
} from '../helpers/dynamic-pricing';
import type {
  PricingConfig,
  PricingInput,
  PricingResult,
} from '../helpers/dynamic-pricing';

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

/** Build a Date at the specified hour on a given weekday (0=Sun..6=Sat). */
function dateAtHour(hour: number, dayOfWeek = 3 /* Wednesday */): Date {
  // 2026-03-01 is a Sunday (dayOfWeek 0)
  const base = new Date(2026, 2, 1 + dayOfWeek, hour, 0, 0, 0);
  return base;
}

/** Return a fully-enabled config with defaults. */
function enabledConfig(overrides: Partial<PricingConfig> = {}): PricingConfig {
  return { ...getDefaultPricingConfig(), enabled: true, ...overrides };
}

/** Shorthand to build a PricingInput. */
function input(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    basePriceCents: 10000, // $100.00
    slotDateTime: dateAtHour(12, 3), // Wed noon (regular hour, weekday)
    now: dateAtHour(10, 3),          // 2 hrs before slot — same day
    currentUtilization: 0.50,        // medium — no demand adjustment
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// getDefaultPricingConfig
// ═══════════════════════════════════════════════════════════════════

describe('getDefaultPricingConfig', () => {
  it('returns config with enabled=false', () => {
    const cfg = getDefaultPricingConfig();
    expect(cfg.enabled).toBe(false);
  });

  it('contains all required fields', () => {
    const cfg = getDefaultPricingConfig();
    expect(cfg).toHaveProperty('peakMultiplier');
    expect(cfg).toHaveProperty('offPeakMultiplier');
    expect(cfg).toHaveProperty('peakHours');
    expect(cfg).toHaveProperty('offPeakHours');
    expect(cfg).toHaveProperty('dayOfWeekMultipliers');
    expect(cfg).toHaveProperty('highDemandThreshold');
    expect(cfg).toHaveProperty('highDemandMultiplier');
    expect(cfg).toHaveProperty('lowDemandThreshold');
    expect(cfg).toHaveProperty('lowDemandMultiplier');
    expect(cfg).toHaveProperty('minPriceFloor');
    expect(cfg).toHaveProperty('maxPriceCeiling');
    expect(cfg).toHaveProperty('sameDayDiscountMultiplier');
    expect(cfg).toHaveProperty('advanceBookingMultiplier');
  });

  it('peak multiplier is greater than 1.0', () => {
    const cfg = getDefaultPricingConfig();
    expect(cfg.peakMultiplier).toBeGreaterThan(1.0);
  });

  it('off-peak multiplier is less than 1.0', () => {
    const cfg = getDefaultPricingConfig();
    expect(cfg.offPeakMultiplier).toBeLessThan(1.0);
  });

  it('has non-empty peak hours array', () => {
    const cfg = getDefaultPricingConfig();
    expect(cfg.peakHours.length).toBeGreaterThan(0);
    for (const h of cfg.peakHours) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(23);
    }
  });

  it('has non-empty off-peak hours array', () => {
    const cfg = getDefaultPricingConfig();
    expect(cfg.offPeakHours.length).toBeGreaterThan(0);
    for (const h of cfg.offPeakHours) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(23);
    }
  });

  it('peak and off-peak hours do not overlap', () => {
    const cfg = getDefaultPricingConfig();
    const overlap = cfg.peakHours.filter((h) => cfg.offPeakHours.includes(h));
    expect(overlap).toEqual([]);
  });

  it('weekend multiplier is defined (Saturday)', () => {
    const cfg = getDefaultPricingConfig();
    expect(cfg.dayOfWeekMultipliers[6]).toBeDefined();
  });

  it('price floor and ceiling are sensible', () => {
    const cfg = getDefaultPricingConfig();
    expect(cfg.minPriceFloor).toBeGreaterThan(0);
    expect(cfg.minPriceFloor).toBeLessThan(1.0);
    expect(cfg.maxPriceCeiling).toBeGreaterThan(1.0);
  });

  it('price floor is less than price ceiling', () => {
    const cfg = getDefaultPricingConfig();
    expect(cfg.minPriceFloor).toBeLessThan(cfg.maxPriceCeiling);
  });
});

// ═══════════════════════════════════════════════════════════════════
// getTimeOfDayAdjustment
// ═══════════════════════════════════════════════════════════════════

describe('getTimeOfDayAdjustment', () => {
  const cfg = enabledConfig();

  it('returns peak adjustment for peak hour', () => {
    const adj = getTimeOfDayAdjustment(cfg, 10);
    expect(adj).not.toBeNull();
    expect(adj!.type).toBe('time_of_day');
    expect(adj!.multiplier).toBe(cfg.peakMultiplier);
    expect(adj!.label).toContain('Peak');
  });

  it('returns off-peak adjustment for off-peak hour', () => {
    const adj = getTimeOfDayAdjustment(cfg, 8);
    expect(adj).not.toBeNull();
    expect(adj!.type).toBe('time_of_day');
    expect(adj!.multiplier).toBe(cfg.offPeakMultiplier);
    expect(adj!.label).toContain('Off-peak');
  });

  it('returns null for regular hour (not peak or off-peak)', () => {
    const adj = getTimeOfDayAdjustment(cfg, 12);
    expect(adj).toBeNull();
  });

  it('handles first hour of peak range', () => {
    // Default peak hours: [10, 11, 14, 15, 16]
    const adj = getTimeOfDayAdjustment(cfg, 10);
    expect(adj).not.toBeNull();
    expect(adj!.multiplier).toBe(cfg.peakMultiplier);
  });

  it('handles last hour of peak range', () => {
    const adj = getTimeOfDayAdjustment(cfg, 16);
    expect(adj).not.toBeNull();
    expect(adj!.multiplier).toBe(cfg.peakMultiplier);
  });

  it('returns null for hour just before peak (hour 9 is off-peak, not peak)', () => {
    // 9 is off-peak in default config, not peak
    const adj = getTimeOfDayAdjustment(cfg, 9);
    // 9 is in offPeakHours, so it returns off-peak, not null
    expect(adj).not.toBeNull();
    expect(adj!.multiplier).toBe(cfg.offPeakMultiplier);
  });

  it('returns null for hour just after last peak (hour 17 is neither)', () => {
    const adj = getTimeOfDayAdjustment(cfg, 17);
    expect(adj).toBeNull();
  });

  it('returns null for midnight (hour 0)', () => {
    const adj = getTimeOfDayAdjustment(cfg, 0);
    expect(adj).toBeNull();
  });

  it('returns null for hour 23', () => {
    const adj = getTimeOfDayAdjustment(cfg, 23);
    expect(adj).toBeNull();
  });

  it('label includes the hour', () => {
    const adj = getTimeOfDayAdjustment(cfg, 14);
    expect(adj!.label).toContain('14:00');
  });
});

// ═══════════════════════════════════════════════════════════════════
// getDayOfWeekAdjustment
// ═══════════════════════════════════════════════════════════════════

describe('getDayOfWeekAdjustment', () => {
  const cfg = enabledConfig();

  it('returns discount for Sunday (default multiplier 0.9)', () => {
    const adj = getDayOfWeekAdjustment(cfg, 0);
    expect(adj).not.toBeNull();
    expect(adj!.type).toBe('day_of_week');
    expect(adj!.multiplier).toBe(0.9);
    expect(adj!.label).toContain('Sunday');
    expect(adj!.label).toContain('discount');
  });

  it('returns premium for Saturday (default multiplier 1.1)', () => {
    const adj = getDayOfWeekAdjustment(cfg, 6);
    expect(adj).not.toBeNull();
    expect(adj!.type).toBe('day_of_week');
    expect(adj!.multiplier).toBe(1.1);
    expect(adj!.label).toContain('Saturday');
    expect(adj!.label).toContain('premium');
  });

  it('returns null for weekday with no multiplier (Monday)', () => {
    const adj = getDayOfWeekAdjustment(cfg, 1);
    expect(adj).toBeNull();
  });

  it('returns null for Tuesday', () => {
    expect(getDayOfWeekAdjustment(cfg, 2)).toBeNull();
  });

  it('returns null for Wednesday', () => {
    expect(getDayOfWeekAdjustment(cfg, 3)).toBeNull();
  });

  it('returns null for Thursday', () => {
    expect(getDayOfWeekAdjustment(cfg, 4)).toBeNull();
  });

  it('returns null for Friday (no multiplier in default config)', () => {
    expect(getDayOfWeekAdjustment(cfg, 5)).toBeNull();
  });

  it('returns null when multiplier is exactly 1.0', () => {
    const custom = enabledConfig({
      dayOfWeekMultipliers: { 5: 1.0 },
    });
    expect(getDayOfWeekAdjustment(custom, 5)).toBeNull();
  });

  it('returns adjustment when Friday multiplier is configured', () => {
    const custom = enabledConfig({
      dayOfWeekMultipliers: { 5: 1.05 },
    });
    const adj = getDayOfWeekAdjustment(custom, 5);
    expect(adj).not.toBeNull();
    expect(adj!.multiplier).toBe(1.05);
    expect(adj!.label).toContain('Friday');
  });
});

// ═══════════════════════════════════════════════════════════════════
// getDemandAdjustment
// ═══════════════════════════════════════════════════════════════════

describe('getDemandAdjustment', () => {
  const cfg = enabledConfig();

  it('returns surge multiplier for high demand (90%+ utilization)', () => {
    const adj = getDemandAdjustment(cfg, 0.92);
    expect(adj).not.toBeNull();
    expect(adj!.type).toBe('demand');
    expect(adj!.multiplier).toBe(cfg.highDemandMultiplier);
    expect(adj!.label).toContain('High demand');
    expect(adj!.label).toContain('92%');
  });

  it('returns discount multiplier for low demand (< 30% utilization)', () => {
    const adj = getDemandAdjustment(cfg, 0.20);
    expect(adj).not.toBeNull();
    expect(adj!.type).toBe('demand');
    expect(adj!.multiplier).toBe(cfg.lowDemandMultiplier);
    expect(adj!.label).toContain('Low demand');
    expect(adj!.label).toContain('20%');
  });

  it('returns null for medium demand (50%)', () => {
    const adj = getDemandAdjustment(cfg, 0.50);
    expect(adj).toBeNull();
  });

  it('returns null at exactly the boundary between low and medium (31%)', () => {
    const adj = getDemandAdjustment(cfg, 0.31);
    expect(adj).toBeNull();
  });

  it('returns high demand at exactly the high threshold (85%)', () => {
    const adj = getDemandAdjustment(cfg, 0.85);
    expect(adj).not.toBeNull();
    expect(adj!.multiplier).toBe(cfg.highDemandMultiplier);
  });

  it('returns low demand at exactly the low threshold (30%)', () => {
    const adj = getDemandAdjustment(cfg, 0.30);
    expect(adj).not.toBeNull();
    expect(adj!.multiplier).toBe(cfg.lowDemandMultiplier);
  });

  it('clamps utilization at 0% (no crash)', () => {
    const adj = getDemandAdjustment(cfg, 0.0);
    expect(adj).not.toBeNull();
    expect(adj!.multiplier).toBe(cfg.lowDemandMultiplier);
    expect(adj!.label).toContain('0%');
  });

  it('clamps utilization at 100% (no crash)', () => {
    const adj = getDemandAdjustment(cfg, 1.0);
    expect(adj).not.toBeNull();
    expect(adj!.multiplier).toBe(cfg.highDemandMultiplier);
    expect(adj!.label).toContain('100%');
  });

  it('clamps negative utilization to 0', () => {
    const adj = getDemandAdjustment(cfg, -0.5);
    expect(adj).not.toBeNull();
    expect(adj!.label).toContain('0%');
  });

  it('clamps utilization above 1.0 to 100%', () => {
    const adj = getDemandAdjustment(cfg, 1.5);
    expect(adj).not.toBeNull();
    expect(adj!.label).toContain('100%');
  });
});

// ═══════════════════════════════════════════════════════════════════
// getLeadTimeAdjustment
// ═══════════════════════════════════════════════════════════════════

describe('getLeadTimeAdjustment', () => {
  const cfg = enabledConfig();

  it('returns same-day multiplier for same-day booking', () => {
    const now = new Date(2026, 2, 4, 8, 0, 0);   // Wed 8am
    const slot = new Date(2026, 2, 4, 14, 0, 0);  // Wed 2pm
    const adj = getLeadTimeAdjustment(cfg, slot, now);
    expect(adj).not.toBeNull();
    expect(adj!.type).toBe('lead_time');
    expect(adj!.multiplier).toBe(cfg.sameDayDiscountMultiplier);
    expect(adj!.label).toContain('Same-day');
  });

  it('returns null for 1-day lead time (within normal range)', () => {
    const now = new Date(2026, 2, 4, 8, 0, 0);
    const slot = new Date(2026, 2, 5, 14, 0, 0); // next day
    const adj = getLeadTimeAdjustment(cfg, slot, now);
    expect(adj).toBeNull();
  });

  it('returns null for 7-day lead time', () => {
    const now = new Date(2026, 2, 4, 8, 0, 0);
    const slot = new Date(2026, 2, 11, 14, 0, 0); // 7 days
    const adj = getLeadTimeAdjustment(cfg, slot, now);
    expect(adj).toBeNull();
  });

  it('returns null for exactly 30-day lead time', () => {
    const now = new Date(2026, 2, 1, 10, 0, 0);
    const slot = new Date(2026, 2, 31, 10, 0, 0); // exactly 30 days
    const adj = getLeadTimeAdjustment(cfg, slot, now);
    expect(adj).toBeNull();
  });

  it('returns advance booking multiplier for 31+ days', () => {
    const now = new Date(2026, 2, 1, 10, 0, 0);
    const slot = new Date(2026, 3, 2, 10, 0, 0); // 32 days out
    const custom = enabledConfig({ advanceBookingMultiplier: 0.9 });
    const adj = getLeadTimeAdjustment(custom, slot, now);
    expect(adj).not.toBeNull();
    expect(adj!.multiplier).toBe(0.9);
    expect(adj!.label).toContain('Advance booking');
  });

  it('returns null for advance booking when multiplier is 1.0 (default)', () => {
    const now = new Date(2026, 2, 1, 10, 0, 0);
    const slot = new Date(2026, 3, 5, 10, 0, 0); // 35 days
    const adj = getLeadTimeAdjustment(cfg, slot, now);
    // Default advanceBookingMultiplier is 1.0, so null
    expect(adj).toBeNull();
  });

  it('handles negative lead time (slot in the past)', () => {
    const now = new Date(2026, 2, 4, 14, 0, 0);
    const slot = new Date(2026, 2, 4, 8, 0, 0); // already past
    const adj = getLeadTimeAdjustment(cfg, slot, now);
    // diffDays < 1 → same-day
    expect(adj).not.toBeNull();
    expect(adj!.multiplier).toBe(cfg.sameDayDiscountMultiplier);
  });

  it('returns null for same-day when sameDayDiscountMultiplier is 1.0', () => {
    const custom = enabledConfig({ sameDayDiscountMultiplier: 1.0 });
    const now = new Date(2026, 2, 4, 8, 0, 0);
    const slot = new Date(2026, 2, 4, 14, 0, 0);
    const adj = getLeadTimeAdjustment(custom, slot, now);
    expect(adj).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// calculateDynamicPrice — disabled config
// ═══════════════════════════════════════════════════════════════════

describe('calculateDynamicPrice — disabled config', () => {
  it('returns base price unchanged when config.enabled is false', () => {
    const cfg = getDefaultPricingConfig(); // enabled=false
    const result = calculateDynamicPrice(cfg, input());
    expect(result.finalPriceCents).toBe(10000);
    expect(result.basePriceCents).toBe(10000);
    expect(result.combinedMultiplier).toBe(1.0);
    expect(result.adjustments).toEqual([]);
  });

  it('ignores all input factors when disabled', () => {
    const cfg = getDefaultPricingConfig();
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 5000,
      slotDateTime: dateAtHour(10, 6), // peak hour + Saturday
      currentUtilization: 0.95,
      providerMultiplier: 1.5,
    }));
    expect(result.finalPriceCents).toBe(5000);
    expect(result.adjustments).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// calculateDynamicPrice — enabled with no applicable adjustments
// ═══════════════════════════════════════════════════════════════════

describe('calculateDynamicPrice — no adjustments', () => {
  it('returns base price when no adjustments apply', () => {
    // Wed noon, medium utilization, 2 hrs lead, no provider multiplier
    const cfg = enabledConfig();
    const result = calculateDynamicPrice(cfg, input({
      slotDateTime: dateAtHour(12, 3),
      now: new Date(2026, 2, 2, 10, 0, 0), // 2 days before
      currentUtilization: 0.50,
    }));
    expect(result.finalPriceCents).toBe(10000);
    expect(result.combinedMultiplier).toBe(1.0);
    expect(result.adjustments).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// calculateDynamicPrice — single adjustments
// ═══════════════════════════════════════════════════════════════════

describe('calculateDynamicPrice — single adjustments', () => {
  it('applies time-of-day peak adjustment only', () => {
    const cfg = enabledConfig();
    // Peak hour (10), Wednesday, normal demand, multi-day lead
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(10, 3),
      now: new Date(2026, 2, 1, 10, 0, 0), // 3 days before
      currentUtilization: 0.50,
    }));
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]!.type).toBe('time_of_day');
    expect(result.finalPriceCents).toBe(Math.round(10000 * 1.15));
  });

  it('applies day-of-week adjustment only', () => {
    const cfg = enabledConfig();
    // Saturday (6), regular hour (12), normal demand, multi-day lead
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(12, 6),
      now: new Date(2026, 2, 4, 10, 0, 0), // 3 days before Saturday
      currentUtilization: 0.50,
    }));
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]!.type).toBe('day_of_week');
    expect(result.finalPriceCents).toBe(Math.round(10000 * 1.1));
  });

  it('applies demand adjustment only', () => {
    const cfg = enabledConfig();
    // Regular hour + weekday + multi-day lead, but HIGH demand
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(12, 3),
      now: new Date(2026, 2, 2, 10, 0, 0),
      currentUtilization: 0.92,
    }));
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]!.type).toBe('demand');
    expect(result.finalPriceCents).toBe(Math.round(10000 * 1.20));
  });

  it('applies provider multiplier only', () => {
    const cfg = enabledConfig();
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(12, 3),
      now: new Date(2026, 2, 2, 10, 0, 0),
      currentUtilization: 0.50,
      providerMultiplier: 1.25,
    }));
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]!.type).toBe('provider');
    expect(result.finalPriceCents).toBe(Math.round(10000 * 1.25));
  });
});

// ═══════════════════════════════════════════════════════════════════
// calculateDynamicPrice — multiple adjustments combined
// ═══════════════════════════════════════════════════════════════════

describe('calculateDynamicPrice — multiple adjustments', () => {
  it('peak + weekend + high demand = cumulative premium', () => {
    const cfg = enabledConfig();
    // Saturday (6), peak hour (10), high demand
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(10, 6), // Sat 10am
      now: new Date(2026, 2, 4, 10, 0, 0), // 3 days before
      currentUtilization: 0.90,
    }));
    // peak 1.15 * sat 1.1 * high demand 1.20 = 1.518
    // Capped by maxPriceCeiling of 1.50
    const expectedMultiplier = 1.50; // ceiling
    expect(result.combinedMultiplier).toBe(expectedMultiplier);
    expect(result.finalPriceCents).toBe(Math.round(10000 * 1.50));
    expect(result.adjustments.length).toBeGreaterThanOrEqual(3);
  });

  it('off-peak + sunday + low demand = cumulative discount', () => {
    const cfg = enabledConfig();
    // Sunday (0), off-peak (8), low demand
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(8, 0), // Sun 8am
      now: new Date(2026, 2, 2, 10, 0, 0), // 6 days before
      currentUtilization: 0.10,
    }));
    // offPeak 0.90 * sun 0.9 * lowDemand 0.85 = 0.6885
    // Floor = 0.70 → clamped
    expect(result.combinedMultiplier).toBe(0.70);
    expect(result.finalPriceCents).toBe(Math.round(10000 * 0.70));
  });

  it('multiple adjustments are multiplied, not added', () => {
    const cfg = enabledConfig({
      peakMultiplier: 1.10,
      dayOfWeekMultipliers: { 6: 1.10 },
    });
    // Two 10% premiums = 1.10 * 1.10 = 1.21, NOT 1.20
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(10, 6), // Sat peak
      now: new Date(2026, 2, 4, 10, 0, 0),
      currentUtilization: 0.50,
    }));
    expect(result.finalPriceCents).toBe(Math.round(10000 * 1.10 * 1.10));
  });
});

// ═══════════════════════════════════════════════════════════════════
// calculateDynamicPrice — floor and ceiling enforcement
// ═══════════════════════════════════════════════════════════════════

describe('calculateDynamicPrice — floor and ceiling', () => {
  it('enforces price floor (never below minimum)', () => {
    const cfg = enabledConfig({
      minPriceFloor: 0.80,
      offPeakMultiplier: 0.50, // extreme discount
      lowDemandMultiplier: 0.50,
      lowDemandThreshold: 0.50,
    });
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(8, 0), // off-peak + Sunday
      now: new Date(2026, 2, 2, 10, 0, 0),
      currentUtilization: 0.10, // low demand
    }));
    // 0.50 * 0.9(sun) * 0.50 = 0.225 → floor at 0.80
    expect(result.combinedMultiplier).toBe(0.80);
    expect(result.finalPriceCents).toBe(8000);
  });

  it('enforces price ceiling (never above maximum)', () => {
    const cfg = enabledConfig({
      maxPriceCeiling: 1.30,
      peakMultiplier: 1.50,
      highDemandMultiplier: 1.50,
      highDemandThreshold: 0.50,
    });
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(10, 6), // peak + Saturday
      now: new Date(2026, 2, 4, 10, 0, 0),
      currentUtilization: 0.80, // high demand
    }));
    // 1.50 * 1.1(sat) * 1.50 = 2.475 → ceiling at 1.30
    expect(result.combinedMultiplier).toBe(1.30);
    expect(result.finalPriceCents).toBe(13000);
  });
});

// ═══════════════════════════════════════════════════════════════════
// calculateDynamicPrice — arithmetic edge cases
// ═══════════════════════════════════════════════════════════════════

describe('calculateDynamicPrice — arithmetic edge cases', () => {
  it('zero base price returns zero', () => {
    const cfg = enabledConfig();
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 0,
      slotDateTime: dateAtHour(10, 6), // peak + Saturday
      currentUtilization: 0.90,
    }));
    expect(result.finalPriceCents).toBe(0);
    expect(result.basePriceCents).toBe(0);
  });

  it('$0.01 base price with multipliers (minimum cents)', () => {
    const cfg = enabledConfig();
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 1,
      slotDateTime: dateAtHour(10, 3), // peak hour
      now: new Date(2026, 2, 2, 10, 0, 0),
      currentUtilization: 0.50,
    }));
    // 1 * 1.15 = 1.15 → rounds to 1
    expect(result.finalPriceCents).toBe(Math.round(1 * 1.15));
  });

  it('large base price ($10,000) does not overflow', () => {
    const cfg = enabledConfig();
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 1_000_000, // $10,000
      slotDateTime: dateAtHour(10, 6), // peak + Saturday
      now: new Date(2026, 2, 4, 10, 0, 0),
      currentUtilization: 0.90,
    }));
    expect(result.finalPriceCents).toBeGreaterThan(1_000_000);
    expect(Number.isFinite(result.finalPriceCents)).toBe(true);
    expect(Number.isInteger(result.finalPriceCents)).toBe(true);
  });

  it('very large base price ($100,000) still produces integer cents', () => {
    const cfg = enabledConfig();
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10_000_000, // $100,000
      slotDateTime: dateAtHour(10, 3),
      now: new Date(2026, 2, 2, 10, 0, 0),
      currentUtilization: 0.50,
    }));
    expect(Number.isInteger(result.finalPriceCents)).toBe(true);
  });

  it('multiplier of exactly 1.0 on provider results in no change', () => {
    const cfg = enabledConfig();
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(12, 3),
      now: new Date(2026, 2, 2, 10, 0, 0),
      currentUtilization: 0.50,
      providerMultiplier: 1.0,
    }));
    // provider multiplier 1.0 is filtered out as non-adjustment
    expect(result.adjustments.find((a) => a.type === 'provider')).toBeUndefined();
    expect(result.finalPriceCents).toBe(10000);
  });

  it('provider multiplier of 0 triggers floor', () => {
    const cfg = enabledConfig({ minPriceFloor: 0.50 });
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(12, 3),
      now: new Date(2026, 2, 2, 10, 0, 0),
      currentUtilization: 0.50,
      providerMultiplier: 0.0,
    }));
    // 0.0 clamped to floor of 0.50
    expect(result.combinedMultiplier).toBe(0.50);
    expect(result.finalPriceCents).toBe(5000);
  });

  it('extremely high provider multiplier triggers ceiling', () => {
    const cfg = enabledConfig({ maxPriceCeiling: 2.0 });
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: dateAtHour(12, 3),
      now: new Date(2026, 2, 2, 10, 0, 0),
      currentUtilization: 0.50,
      providerMultiplier: 10.0,
    }));
    expect(result.combinedMultiplier).toBe(2.0);
    expect(result.finalPriceCents).toBe(20000);
  });

  it('result.finalPriceCents is always an integer (no floating-point drift)', () => {
    const cfg = enabledConfig({ peakMultiplier: 1.333 });
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 9999,
      slotDateTime: dateAtHour(10, 3),
      now: new Date(2026, 2, 2, 10, 0, 0),
      currentUtilization: 0.50,
    }));
    expect(Number.isInteger(result.finalPriceCents)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// calculateDynamicPrice — adjustments breakdown
// ═══════════════════════════════════════════════════════════════════

describe('calculateDynamicPrice — adjustments breakdown', () => {
  it('returns empty adjustments when none apply', () => {
    const cfg = enabledConfig();
    const result = calculateDynamicPrice(cfg, input({
      slotDateTime: dateAtHour(12, 3),
      now: new Date(2026, 2, 2, 10, 0, 0),
      currentUtilization: 0.50,
    }));
    expect(result.adjustments).toEqual([]);
  });

  it('includes all applicable adjustments in order', () => {
    const cfg = enabledConfig({
      advanceBookingMultiplier: 0.95, // make advance booking active
    });
    // Saturday (day 6), peak hour (10), high demand, 35-day lead, provider premium
    const slot = dateAtHour(10, 6);
    const now = new Date(slot.getTime() - 35 * 24 * 60 * 60 * 1000); // 35 days before
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: slot,
      now,
      currentUtilization: 0.92,
      providerMultiplier: 1.15,
    }));

    const types = result.adjustments.map((a) => a.type);
    expect(types).toContain('time_of_day');
    expect(types).toContain('day_of_week');
    expect(types).toContain('demand');
    expect(types).toContain('lead_time');
    expect(types).toContain('provider');
    expect(result.adjustments).toHaveLength(5);
  });

  it('each adjustment has type, label, and multiplier', () => {
    const cfg = enabledConfig();
    const result = calculateDynamicPrice(cfg, input({
      slotDateTime: dateAtHour(10, 6), // peak + Saturday
      now: new Date(2026, 2, 4, 10, 0, 0),
      currentUtilization: 0.90,
      providerMultiplier: 1.1,
    }));

    for (const adj of result.adjustments) {
      expect(adj.type).toBeTruthy();
      expect(adj.label).toBeTruthy();
      expect(typeof adj.multiplier).toBe('number');
      expect(adj.multiplier).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// calculateDynamicPrice — same-day lead time integration
// ═══════════════════════════════════════════════════════════════════

describe('calculateDynamicPrice — lead time integration', () => {
  it('same-day booking receives lead time adjustment', () => {
    const cfg = enabledConfig();
    const now = new Date(2026, 2, 4, 8, 0, 0);
    const slot = new Date(2026, 2, 4, 12, 0, 0); // same day, 4 hrs out
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: slot,
      now,
      currentUtilization: 0.50,
    }));
    expect(result.adjustments.find((a) => a.type === 'lead_time')).toBeDefined();
    expect(result.finalPriceCents).toBe(Math.round(10000 * 0.95));
  });

  it('booking 15 days out has no lead time adjustment', () => {
    const cfg = enabledConfig();
    const _now = new Date(2026, 2, 1, 10, 0, 0);
    const slot = dateAtHour(12, 3); // 3 days out (Wed)
    // Ensure > 1 day and <= 30 day lead
    const nowEarly = new Date(slot.getTime() - 15 * 24 * 60 * 60 * 1000);
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 10000,
      slotDateTime: slot,
      now: nowEarly,
      currentUtilization: 0.50,
    }));
    expect(result.adjustments.find((a) => a.type === 'lead_time')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// formatPricingBreakdown
// ═══════════════════════════════════════════════════════════════════

describe('formatPricingBreakdown', () => {
  it('shows base price and final price', () => {
    const result: PricingResult = {
      basePriceCents: 10000,
      finalPriceCents: 11500,
      combinedMultiplier: 1.15,
      adjustments: [
        { type: 'time_of_day', label: 'Peak hour (10:00)', multiplier: 1.15 },
      ],
    };
    const text = formatPricingBreakdown(result);
    expect(text).toContain('Base price: $100.00');
    expect(text).toContain('Final price: $115.00');
  });

  it('shows "No adjustments" when no adjustments applied', () => {
    const result: PricingResult = {
      basePriceCents: 5000,
      finalPriceCents: 5000,
      combinedMultiplier: 1.0,
      adjustments: [],
    };
    const text = formatPricingBreakdown(result);
    expect(text).toContain('No adjustments applied');
    expect(text).toContain('Base price: $50.00');
    expect(text).toContain('Final price: $50.00');
  });

  it('lists each adjustment with percentage', () => {
    const result: PricingResult = {
      basePriceCents: 10000,
      finalPriceCents: 12650,
      combinedMultiplier: 1.265,
      adjustments: [
        { type: 'time_of_day', label: 'Peak hour (10:00)', multiplier: 1.15 },
        { type: 'day_of_week', label: 'Saturday premium', multiplier: 1.10 },
      ],
    };
    const text = formatPricingBreakdown(result);
    expect(text).toContain('Peak hour (10:00)');
    expect(text).toContain('+15.0%');
    expect(text).toContain('Saturday premium');
    expect(text).toContain('+10.0%');
    expect(text).toContain('Combined multiplier');
  });

  it('shows negative percentage for discounts', () => {
    const result: PricingResult = {
      basePriceCents: 10000,
      finalPriceCents: 8500,
      combinedMultiplier: 0.85,
      adjustments: [
        { type: 'demand', label: 'Low demand (20% utilization)', multiplier: 0.85 },
      ],
    };
    const text = formatPricingBreakdown(result);
    expect(text).toContain('-15.0%');
  });

  it('shows combined multiplier for multi-adjustment results', () => {
    const result: PricingResult = {
      basePriceCents: 10000,
      finalPriceCents: 13800,
      combinedMultiplier: 1.38,
      adjustments: [
        { type: 'time_of_day', label: 'Peak hour (10:00)', multiplier: 1.15 },
        { type: 'demand', label: 'High demand (95%)', multiplier: 1.20 },
      ],
    };
    const text = formatPricingBreakdown(result);
    expect(text).toContain('Combined multiplier: x1.380');
  });

  it('does not show combined multiplier when no adjustments', () => {
    const result: PricingResult = {
      basePriceCents: 10000,
      finalPriceCents: 10000,
      combinedMultiplier: 1.0,
      adjustments: [],
    };
    const text = formatPricingBreakdown(result);
    expect(text).not.toContain('Combined multiplier');
  });
});

// ═══════════════════════════════════════════════════════════════════
// End-to-end scenario tests
// ═══════════════════════════════════════════════════════════════════

describe('end-to-end scenarios', () => {
  it('busy Saturday afternoon with senior stylist', () => {
    const cfg = enabledConfig();
    const slot = dateAtHour(15, 6); // Saturday 3pm (peak)
    const now = new Date(slot.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days before
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 8500, // $85 haircut
      slotDateTime: slot,
      now,
      currentUtilization: 0.88, // high demand
      providerMultiplier: 1.15, // senior stylist
    }));

    // peak (1.15) * saturday (1.1) * high demand (1.20) * provider (1.15) = 1.746
    // Capped at ceiling 1.50
    expect(result.combinedMultiplier).toBe(1.50);
    expect(result.finalPriceCents).toBe(Math.round(8500 * 1.50));
    expect(result.adjustments.length).toBe(4);
  });

  it('quiet Sunday morning walk-in with junior stylist', () => {
    const cfg = enabledConfig();
    const slot = dateAtHour(8, 0); // Sunday 8am (off-peak)
    const now = new Date(slot.getTime() - 2 * 60 * 60 * 1000); // same-day, 2 hrs before
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 5000, // $50 simple cut
      slotDateTime: slot,
      now,
      currentUtilization: 0.15, // low demand
      providerMultiplier: 0.85, // junior stylist
    }));

    // off-peak (0.90) * sunday (0.9) * low demand (0.85) * same-day (0.95) * provider (0.85)
    // = 0.555... → clamped to floor 0.70
    expect(result.combinedMultiplier).toBe(0.70);
    expect(result.finalPriceCents).toBe(Math.round(5000 * 0.70));
  });

  it('standard Wednesday midday booking a week out', () => {
    const cfg = enabledConfig();
    const slot = dateAtHour(13, 3); // Wed 1pm (regular hour)
    const now = new Date(slot.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days before
    const result = calculateDynamicPrice(cfg, input({
      basePriceCents: 12000, // $120 service
      slotDateTime: slot,
      now,
      currentUtilization: 0.55, // normal
    }));

    // No adjustments: regular hour, weekday, normal demand, 7-day lead, no provider
    expect(result.adjustments).toHaveLength(0);
    expect(result.finalPriceCents).toBe(12000);
    expect(result.combinedMultiplier).toBe(1.0);
  });
});
