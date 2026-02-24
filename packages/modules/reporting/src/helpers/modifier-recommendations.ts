/**
 * Modifier Recommendation Engine
 *
 * Pure function — no DB access, no side effects.
 * Takes pre-aggregated read model data and returns health assessments
 * with actionable recommendations for each modifier group.
 */

// ── Types ───────────────────────────────────────────────────────────

export type ModifierRecommendation =
  | 'keep'
  | 'optimize'
  | 'remove'
  | 'investigate'
  | 'review_prompt'
  | 'new';

export interface ModifierGroupHealthInput {
  modifierGroupId: string;
  groupName: string;
  isRequired: boolean;
  eligibleLineCount: number;
  linesWithSelection: number;
  totalSelections: number;
  uniqueModifiers: number;
  revenueImpactDollars: number;
  voidCount: number;
  /** ISO date string — used for "new" detection (< 14 days old) */
  createdAt?: string;
}

export interface ModifierGroupHealthResult extends ModifierGroupHealthInput {
  /** linesWithSelection / eligibleLineCount (0 if no eligible lines) */
  attachRate: number;
  /** totalSelections / linesWithSelection (0 if no selections) */
  avgSelectionsPerCheck: number;
  /** voidCount / linesWithSelection (voidCount / 1 if no selections) */
  voidRate: number;
  recommendation: ModifierRecommendation;
  recommendationLabel: string;
}

export interface ComputeModifierGroupHealthOptions {
  /** Date to compare createdAt against for "new" detection. Defaults to now. */
  referenceDate?: Date;
}

// ── Constants ───────────────────────────────────────────────────────

const NEW_THRESHOLD_DAYS = 14;
const VOID_RATE_THRESHOLD = 0.15;
const REQUIRED_SKIP_THRESHOLD = 0.5;
const REMOVE_ATTACH_THRESHOLD = 0.1;
const REMOVE_MIN_ELIGIBLE_LINES = 50;
const KEEP_ATTACH_THRESHOLD = 0.6;
const OPTIMIZE_LOWER_THRESHOLD = 0.3;
const OPTIMIZE_UPPER_THRESHOLD = 0.6;

// ── Implementation ──────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.abs(b.getTime() - a.getTime()) / msPerDay;
}

function classifyGroup(
  attachRate: number,
  voidRate: number,
  isRequired: boolean,
  eligibleLineCount: number,
  revenueImpactDollars: number,
  createdAt: string | undefined,
  referenceDate: Date,
): { recommendation: ModifierRecommendation; recommendationLabel: string } {
  // Rule 1: New (< 14 days old)
  if (createdAt) {
    const created = new Date(createdAt);
    if (!isNaN(created.getTime()) && daysBetween(created, referenceDate) < NEW_THRESHOLD_DAYS) {
      return { recommendation: 'new', recommendationLabel: 'New \u2014 Collecting Data' };
    }
  }

  // Rule 2: High void rate
  if (voidRate > VOID_RATE_THRESHOLD) {
    return { recommendation: 'investigate', recommendationLabel: 'High Waste \u2014 Investigate' };
  }

  // Rule 3: Required group that customers are skipping
  if (isRequired && attachRate < REQUIRED_SKIP_THRESHOLD) {
    return { recommendation: 'review_prompt', recommendationLabel: 'Customers Skipping \u2014 Review Prompt' };
  }

  // Rule 4: Underperforming optional group (needs enough data)
  if (
    attachRate < REMOVE_ATTACH_THRESHOLD &&
    !isRequired &&
    eligibleLineCount >= REMOVE_MIN_ELIGIBLE_LINES
  ) {
    return { recommendation: 'remove', recommendationLabel: 'Underperforming \u2014 Consider Removing' };
  }

  // Rule 5: High-performing
  if (attachRate >= KEEP_ATTACH_THRESHOLD && revenueImpactDollars > 0) {
    return { recommendation: 'keep', recommendationLabel: 'High-Performing' };
  }

  // Rule 6: Mid-range attach rate
  if (attachRate >= OPTIMIZE_LOWER_THRESHOLD && attachRate < OPTIMIZE_UPPER_THRESHOLD) {
    return { recommendation: 'optimize', recommendationLabel: 'Needs Attention \u2014 Optimize' };
  }

  // Rule 7: Default
  return { recommendation: 'optimize', recommendationLabel: 'Needs Attention' };
}

/**
 * Computes health metrics and recommendation for each modifier group.
 *
 * Pure function — takes read model data, returns enriched results.
 * Rules are evaluated in priority order; first matching rule wins.
 */
export function computeModifierGroupHealth(
  groups: ModifierGroupHealthInput[],
  options?: ComputeModifierGroupHealthOptions,
): ModifierGroupHealthResult[] {
  const referenceDate = options?.referenceDate ?? new Date();

  return groups.map((group) => {
    const attachRate =
      group.eligibleLineCount > 0
        ? group.linesWithSelection / group.eligibleLineCount
        : 0;

    const avgSelectionsPerCheck =
      group.linesWithSelection > 0
        ? group.totalSelections / group.linesWithSelection
        : 0;

    const voidRate =
      group.voidCount / (group.linesWithSelection || 1);

    const { recommendation, recommendationLabel } = classifyGroup(
      attachRate,
      voidRate,
      group.isRequired,
      group.eligibleLineCount,
      group.revenueImpactDollars,
      group.createdAt,
      referenceDate,
    );

    return {
      ...group,
      attachRate,
      avgSelectionsPerCheck,
      voidRate,
      recommendation,
      recommendationLabel,
    };
  });
}
