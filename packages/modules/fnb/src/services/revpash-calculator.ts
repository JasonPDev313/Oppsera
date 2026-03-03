// ── RevPASH (Revenue Per Available Seat Hour) Calculator ────────────
// Pure functions — NO DB imports. All inputs/outputs are plain data.

export interface RevPASHResult {
  revpashCents: number;
  revpashDollars: string;       // formatted "$X.XX"
  totalRevenueCents: number;
  availableSeats: number;
  hoursInPeriod: number;
}

/**
 * Calculate RevPASH: revenue per available seat per hour.
 *
 * RevPASH = totalRevenueCents / (availableSeats * hoursInPeriod)
 *
 * Result is in cents (integer, rounded). Returns $0.00 when inputs are invalid.
 */
export function calculateRevPASH(
  totalRevenueCents: number,
  availableSeats: number,
  hoursInPeriod: number,
): RevPASHResult {
  if (availableSeats <= 0 || hoursInPeriod <= 0) {
    return {
      revpashCents: 0,
      revpashDollars: '$0.00',
      totalRevenueCents,
      availableSeats,
      hoursInPeriod,
    };
  }

  const revpashCents = Math.round(totalRevenueCents / (availableSeats * hoursInPeriod));
  const revpashDollars = `$${(revpashCents / 100).toFixed(2)}`;

  return {
    revpashCents,
    revpashDollars,
    totalRevenueCents,
    availableSeats,
    hoursInPeriod,
  };
}

// ── Dynamic Yield Advisor ────────────────────────────────────────────

export interface DemandSlot {
  interval: string;          // e.g., "11:00-11:30"
  bookedCovers: number;
  walkinCovers: number;
}

export interface YieldRecommendation {
  interval: string;
  recommendation: 'increase' | 'decrease' | 'hold';
  suggestedMaxCovers: number;
  currentMaxCovers: number;
  reason: string;
}

/**
 * Generate yield recommendations for each pacing interval by comparing
 * actual demand to target utilization.
 *
 * Rules:
 *   - utilization < targetUtilization * 0.7  → 'increase' (suggest +20%)
 *   - utilization > targetUtilization * 1.1  → 'decrease' (suggest -10%)
 *   - otherwise                               → 'hold'
 *
 * Suggestions are capped at maxCovers * (1 + maxOverbookPercent/100).
 */
export function generateYieldRecommendations(
  currentPacing: Array<{
    intervalStartTime: string;
    intervalEndTime: string;
    maxCovers: number;
  }>,
  actualDemand: DemandSlot[],
  avgTurnMinutes: number,
  settings: { targetUtilization: number; maxOverbookPercent: number },
): YieldRecommendation[] {
  const { targetUtilization, maxOverbookPercent } = settings;

  // Index demand by interval label
  const demandByInterval = new Map<string, DemandSlot>();
  for (const slot of actualDemand) {
    demandByInterval.set(slot.interval, slot);
  }

  return currentPacing.map((rule) => {
    const intervalLabel = `${rule.intervalStartTime}-${rule.intervalEndTime}`;
    const demand = demandByInterval.get(intervalLabel);

    const bookedCovers = demand?.bookedCovers ?? 0;
    const walkinCovers = demand?.walkinCovers ?? 0;
    const totalCovers = bookedCovers + walkinCovers;

    const currentMaxCovers = rule.maxCovers;
    const absoluteMax = Math.round(currentMaxCovers * (1 + maxOverbookPercent / 100));

    // Utilization ratio (0–1+). When maxCovers is 0 treat as 0 utilization.
    const utilization = currentMaxCovers > 0 ? totalCovers / currentMaxCovers : 0;

    let recommendation: 'increase' | 'decrease' | 'hold';
    let suggestedMaxCovers: number;
    let reason: string;

    if (utilization < targetUtilization * 0.7) {
      // Demand is well below target — open up capacity
      recommendation = 'increase';
      suggestedMaxCovers = Math.min(
        Math.round(currentMaxCovers * 1.2),
        absoluteMax,
      );
      reason = `Utilization ${(utilization * 100).toFixed(0)}% is well below target ${(targetUtilization * 100).toFixed(0)}%. Consider increasing capacity to capture demand.`;
    } else if (utilization > targetUtilization * 1.1) {
      // Demand exceeds target — tighten capacity to protect operations
      recommendation = 'decrease';
      suggestedMaxCovers = Math.max(
        Math.round(currentMaxCovers * 0.9),
        1,
      );
      reason = `Utilization ${(utilization * 100).toFixed(0)}% exceeds target ${(targetUtilization * 100).toFixed(0)}%. Consider reducing capacity to protect service quality.`;
    } else {
      // Demand is in a healthy range
      recommendation = 'hold';
      suggestedMaxCovers = currentMaxCovers;
      const utilizationPct = (utilization * 100).toFixed(0);
      const targetPct = (targetUtilization * 100).toFixed(0);
      reason = `Utilization ${utilizationPct}% is within acceptable range of target ${targetPct}%. Maintain current pacing.`;
    }

    // When avgTurnMinutes is relevant, annotate reason
    if (avgTurnMinutes > 0 && recommendation !== 'hold') {
      reason += ` (avg turn: ${avgTurnMinutes}min)`;
    }

    return {
      interval: intervalLabel,
      recommendation,
      suggestedMaxCovers,
      currentMaxCovers,
      reason,
    };
  });
}
