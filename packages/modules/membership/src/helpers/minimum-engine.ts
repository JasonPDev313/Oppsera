// ── Minimum Spend Engine ─────────────────────────────────────────
// Pure computation functions for minimum spend progress and allocation.
// No DB access, no side effects — safe to use from any context.

export interface MinimumComputeInput {
  requiredCents: number;
  spentCents: number;
  rolloverInCents: number;
  excludeTax: boolean;
  excludeTips: boolean;
  excludeServiceCharges: boolean;
  excludeDues: boolean;
}

export interface MinimumComputeResult {
  satisfiedCents: number;
  shortfallCents: number;
  progressPercent: number;
  isMetMinimum: boolean;
}

/**
 * Computes minimum spend progress for a given input.
 *
 * `spentCents` should already have exclusions applied by the caller
 * (i.e., tax/tips/service charges/dues removed before passing in).
 *
 * @returns Progress result with shortfall, percentage, and met flag
 */
export function computeMinimumProgress(input: MinimumComputeInput): MinimumComputeResult {
  const { requiredCents, spentCents, rolloverInCents } = input;

  // satisfiedCents = spentCents (filtered amounts already excluded by caller)
  const satisfiedCents = spentCents;

  // shortfallCents = max(0, requiredCents - satisfiedCents - rolloverInCents)
  const shortfallCents = Math.max(0, requiredCents - satisfiedCents - rolloverInCents);

  // progressPercent = min(100, round((satisfiedCents + rolloverInCents) / requiredCents * 100))
  // Guard against division by zero
  const progressPercent = requiredCents > 0
    ? Math.min(100, Math.round(((satisfiedCents + rolloverInCents) / requiredCents) * 100))
    : 100;

  // isMetMinimum = shortfallCents === 0
  const isMetMinimum = shortfallCents === 0;

  return {
    satisfiedCents,
    shortfallCents,
    progressPercent,
    isMetMinimum,
  };
}

export interface AllocationBucket {
  ruleId: string;
  requiredCents: number;
  satisfiedCents: number;
}

export interface AllocationResult {
  ruleId: string;
  allocatedCents: number;
}

/**
 * Allocates total spend across multiple minimum spend buckets.
 *
 * @param totalSpentCents - Total amount to allocate across buckets
 * @param buckets - Buckets to fill (sorted by priority for `first_match` and `priority`)
 * @param method - Allocation strategy
 * @returns Array of allocations per bucket
 */
export function allocateSpend(
  totalSpentCents: number,
  buckets: AllocationBucket[],
  method: 'first_match' | 'proportional' | 'priority',
): AllocationResult[] {
  if (buckets.length === 0 || totalSpentCents <= 0) {
    return buckets.map((b) => ({ ruleId: b.ruleId, allocatedCents: 0 }));
  }

  switch (method) {
    case 'first_match':
    case 'priority': {
      // first_match and priority both fill buckets in order until totalSpent exhausted
      // priority assumes buckets are already sorted by caller
      let remaining = totalSpentCents;
      return buckets.map((bucket) => {
        const gap = Math.max(0, bucket.requiredCents - bucket.satisfiedCents);
        const allocation = Math.min(remaining, gap);
        remaining -= allocation;
        return { ruleId: bucket.ruleId, allocatedCents: allocation };
      });
    }

    case 'proportional': {
      // Allocate proportionally to each bucket's requiredCents
      const totalRequired = buckets.reduce((sum, b) => {
        const gap = Math.max(0, b.requiredCents - b.satisfiedCents);
        return sum + gap;
      }, 0);

      if (totalRequired === 0) {
        return buckets.map((b) => ({ ruleId: b.ruleId, allocatedCents: 0 }));
      }

      // Cap total allocation at totalRequired
      const cappedSpent = Math.min(totalSpentCents, totalRequired);

      // Proportional allocation with remainder distribution
      const rawAllocations = buckets.map((bucket) => {
        const gap = Math.max(0, bucket.requiredCents - bucket.satisfiedCents);
        const share = (gap / totalRequired) * cappedSpent;
        return {
          ruleId: bucket.ruleId,
          allocatedCents: Math.floor(share),
          fractional: share - Math.floor(share),
          gap,
        };
      });

      // Distribute remainder cents (largest fractional parts first)
      const allocated = rawAllocations.reduce((sum, r) => sum + r.allocatedCents, 0);
      let remainder = cappedSpent - allocated;

      // Sort by fractional DESC for remainder distribution, stable sort by ruleId for ties
      const sorted = [...rawAllocations].sort((a, b) =>
        b.fractional - a.fractional || a.ruleId.localeCompare(b.ruleId),
      );

      for (const entry of sorted) {
        if (remainder <= 0) break;
        // Don't exceed the bucket's gap
        if (entry.allocatedCents < entry.gap) {
          entry.allocatedCents += 1;
          remainder -= 1;
        }
      }

      // Return in original order
      return buckets.map((bucket) => {
        const found = rawAllocations.find((r) => r.ruleId === bucket.ruleId)!;
        return { ruleId: found.ruleId, allocatedCents: found.allocatedCents };
      });
    }

    default: {
      // Fallback: no allocation for unknown methods
      return buckets.map((b) => ({ ruleId: b.ruleId, allocatedCents: 0 }));
    }
  }
}
