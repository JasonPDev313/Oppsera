// ── Pacing Engine — Pure Functions (no DB imports) ─────────────────

export interface PacingRule {
  id: string;
  mealPeriod: string | null;
  dayOfWeek: number | null;
  intervalStartTime: string | null; // HH:MM
  intervalEndTime: string | null;   // HH:MM
  maxCovers: number;
  maxReservations: number | null;
  minPartySize: number | null;
  priority: number;
  isActive: boolean;
}

export interface PacingEvalInput {
  time: string;      // HH:MM
  partySize: number;
  mealPeriod: string;
  dayOfWeek: number; // 0–6 (Sunday = 0)
}

export interface PacingEvalResult {
  allowed: boolean;
  remainingCapacity: number;
  appliedRule: PacingRule | null;
  reason?: string;
}

export interface PacingSlot {
  intervalStart: string;
  intervalEnd: string;
  maxCovers: number;
  bookedCovers: number;
  remaining: number;
}

// ── Time helpers ───────────────────────────────────────────────────

/**
 * Convert HH:MM to minutes since midnight for comparison.
 * Returns 0 for malformed or empty strings — the `??` operator only guards
 * against undefined/null, NOT NaN, so we apply an explicit NaN check.
 */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const hours = Number.isNaN(h) ? 0 : (h ?? 0);
  const mins = Number.isNaN(m) ? 0 : (m ?? 0);
  return hours * 60 + mins;
}

/**
 * Return true if `time` falls within [start, end] inclusive (all HH:MM strings).
 * If either bound is null, that bound is considered unbounded.
 */
function isWithinWindow(
  time: string,
  start: string | null,
  end: string | null,
): boolean {
  if (start === null && end === null) return true;
  const t = toMinutes(time);
  if (start !== null && t < toMinutes(start)) return false;
  if (end !== null && t > toMinutes(end)) return false;
  return true;
}

// ── Rule matching ──────────────────────────────────────────────────

function ruleMatches(rule: PacingRule, input: PacingEvalInput): boolean {
  if (!rule.isActive) return false;

  // Meal period: null = wildcard
  if (rule.mealPeriod !== null && rule.mealPeriod !== input.mealPeriod) return false;

  // Day of week: null = wildcard
  if (rule.dayOfWeek !== null && rule.dayOfWeek !== input.dayOfWeek) return false;

  // Time window: null start/end = unbounded
  if (!isWithinWindow(input.time, rule.intervalStartTime, rule.intervalEndTime)) return false;

  // Min party size: null = no minimum enforced by this rule
  if (rule.minPartySize !== null && input.partySize < rule.minPartySize) return false;

  return true;
}

// ── Core evaluation ────────────────────────────────────────────────

/**
 * Evaluate whether a proposed booking is permitted under the current pacing rules.
 *
 * @param rules       - All pacing rules for the location (active + inactive; filtering is internal).
 * @param existingCovers - Already-booked covers with their reservation time (HH:MM).
 * @param proposed    - The proposed booking to evaluate.
 */
export function evaluatePacing(
  rules: PacingRule[],
  existingCovers: Array<{ time: string; covers: number }>,
  proposed: PacingEvalInput,
): PacingEvalResult {
  // Find all matching rules, sorted by priority DESC (highest wins).
  // Tie-break by id ASC for deterministic ordering when priorities are equal —
  // this matches the DB query order (ORDER BY priority DESC, id ASC) and
  // prevents non-deterministic behaviour across JS engine sort implementations.
  const matching = rules
    .filter((r) => ruleMatches(r, proposed))
    .sort((a, b) => {
      const byPriority = b.priority - a.priority;
      if (byPriority !== 0) return byPriority;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  if (matching.length === 0) {
    return {
      allowed: true,
      remainingCapacity: Infinity,
      appliedRule: null,
    };
  }

  const rule = matching[0]!;

  // Sum existing covers that fall within this rule's time window
  const sumCovers = existingCovers
    .filter((ec) =>
      isWithinWindow(ec.time, rule.intervalStartTime, rule.intervalEndTime),
    )
    .reduce((acc, ec) => acc + ec.covers, 0);

  // Clamp remainingCapacity to 0 when already over-booked so callers never
  // receive a negative value.  The allowed flag still reflects reality.
  const remainingCapacity = Math.max(0, rule.maxCovers - sumCovers);
  const totalIfAdded = sumCovers + proposed.partySize;
  const allowed = totalIfAdded <= rule.maxCovers;

  return {
    allowed,
    remainingCapacity,
    appliedRule: rule,
    reason: allowed
      ? undefined
      : `Pacing limit reached: ${totalIfAdded}/${rule.maxCovers} covers in this interval`,
  };
}

// ── Availability slot computation ──────────────────────────────────

/**
 * Compute pacing availability slots for all rules matching a given meal period
 * and day of week. Returns one slot per matching rule, showing how many covers
 * are booked vs. remaining.
 *
 * @param rules         - All pacing rules for the location.
 * @param existingCovers - Already-booked covers with their reservation time (HH:MM).
 * @param mealPeriod    - The meal period to filter on.
 * @param dayOfWeek     - Day of week (0–6) to filter on.
 */
export function computePacingAvailability(
  rules: PacingRule[],
  existingCovers: Array<{ time: string; covers: number }>,
  mealPeriod: string,
  dayOfWeek: number,
): PacingSlot[] {
  const applicableRules = rules.filter(
    (r) =>
      r.isActive &&
      (r.mealPeriod === null || r.mealPeriod === mealPeriod) &&
      (r.dayOfWeek === null || r.dayOfWeek === dayOfWeek),
  );

  return applicableRules.map((rule) => {
    const bookedCovers = existingCovers
      .filter((ec) =>
        isWithinWindow(ec.time, rule.intervalStartTime, rule.intervalEndTime),
      )
      .reduce((acc, ec) => acc + ec.covers, 0);

    return {
      intervalStart: rule.intervalStartTime ?? '00:00',
      intervalEnd: rule.intervalEndTime ?? '23:59',
      maxCovers: rule.maxCovers,
      bookedCovers,
      remaining: Math.max(0, rule.maxCovers - bookedCovers),
    };
  });
}
