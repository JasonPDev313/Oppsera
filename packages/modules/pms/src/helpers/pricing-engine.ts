/**
 * Pricing engine helper — pure functions for evaluating pricing rules
 * and computing dynamic rates. No DB access, no side effects.
 */

export interface PricingContext {
  occupancyPct: number;
  dayOfWeek: number; // 0=Sunday
  leadTimeDays: number;
  businessDate: string;
  roomTypeId: string;
}

export interface PricingRuleRow {
  id: string;
  name: string;
  ruleType: string;
  priority: number;
  conditionsJson: Record<string, unknown>;
  adjustmentsJson: Record<string, unknown>;
  floorCents: number | null;
  ceilingCents: number | null;
}

export interface ComputedRate {
  baseCents: number;
  adjustedCents: number;
  rulesApplied: Array<{ ruleId: string; ruleName: string; adjustment: number }>;
}

/**
 * Evaluates whether a pricing rule's conditions match the given context.
 */
export function evaluateConditions(conditions: Record<string, unknown>, context: PricingContext): boolean {
  // Occupancy threshold
  if (typeof conditions.occupancyAbovePct === 'number' && context.occupancyPct < conditions.occupancyAbovePct) {
    return false;
  }
  if (typeof conditions.occupancyBelowPct === 'number' && context.occupancyPct > conditions.occupancyBelowPct) {
    return false;
  }

  // Day of week
  if (Array.isArray(conditions.daysOfWeek) && conditions.daysOfWeek.length > 0) {
    if (!conditions.daysOfWeek.includes(context.dayOfWeek)) return false;
  }

  // Lead time
  if (typeof conditions.leadTimeDaysMin === 'number' && context.leadTimeDays < conditions.leadTimeDaysMin) {
    return false;
  }
  if (typeof conditions.leadTimeDaysMax === 'number' && context.leadTimeDays > conditions.leadTimeDaysMax) {
    return false;
  }

  // Date ranges (seasonal/event)
  if (Array.isArray(conditions.dateRanges) && conditions.dateRanges.length > 0) {
    const inRange = conditions.dateRanges.some((range: unknown) => {
      const r = range as { startDate: string; endDate: string };
      return context.businessDate >= r.startDate && context.businessDate <= r.endDate;
    });
    if (!inRange) return false;
  }

  // Room type filter
  if (Array.isArray(conditions.roomTypeIds) && conditions.roomTypeIds.length > 0) {
    if (!conditions.roomTypeIds.includes(context.roomTypeId)) return false;
  }

  return true;
}

/**
 * Applies a pricing adjustment to a base rate.
 */
export function applyAdjustment(baseCents: number, adjustments: Record<string, unknown>): number {
  const type = adjustments.type as string;
  const amount = Number(adjustments.amount ?? 0);
  const direction = adjustments.direction as string;

  let delta: number;
  if (type === 'percentage') {
    delta = Math.round(baseCents * (amount / 100));
  } else {
    // fixed — amount is in cents
    delta = amount;
  }

  return direction === 'increase' ? baseCents + delta : baseCents - delta;
}

/**
 * Computes the dynamic rate for a room type on a given date by evaluating
 * all active pricing rules in priority order.
 */
export function computeDynamicRate(
  baseCents: number,
  rules: PricingRuleRow[],
  context: PricingContext,
): ComputedRate {
  // Sort rules by priority DESC (higher priority first)
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);

  let currentCents = baseCents;
  const rulesApplied: ComputedRate['rulesApplied'] = [];

  for (const rule of sorted) {
    if (!evaluateConditions(rule.conditionsJson, context)) continue;

    const newCents = applyAdjustment(currentCents, rule.adjustmentsJson);

    // Apply floor and ceiling from the rule
    let clampedCents = newCents;
    if (rule.floorCents != null && clampedCents < rule.floorCents) {
      clampedCents = rule.floorCents;
    }
    if (rule.ceilingCents != null && clampedCents > rule.ceilingCents) {
      clampedCents = rule.ceilingCents;
    }

    const adjustment = clampedCents - currentCents;
    rulesApplied.push({
      ruleId: rule.id,
      ruleName: rule.name,
      adjustment,
    });

    currentCents = clampedCents;
  }

  // Ensure non-negative
  if (currentCents < 0) currentCents = 0;

  return {
    baseCents,
    adjustedCents: currentCents,
    rulesApplied,
  };
}
