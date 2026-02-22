// ── Autopay Retry Engine ──────────────────────────────────────────
// Pure computation functions for retry scheduling.
// No DB access, no side effects.

export interface RetrySchedule {
  shouldRetry: boolean;
  nextRetryAt: string | null; // ISO datetime
  dunningLevel: 'none' | 'reminder' | 'warning' | 'final_notice';
}

/**
 * Computes the next retry schedule based on the current attempt number.
 * Strategy: attempt 1 = immediate, attempt 2 = +3 days, attempt 3 = +7 days, beyond = no retry (mark failed).
 *
 * @param attemptNumber - Current attempt number (1-based)
 * @param lastAttemptDate - ISO date of the last attempt
 * @returns Retry schedule with next attempt timing and dunning level
 */
export function computeRetrySchedule(
  attemptNumber: number,
  lastAttemptDate: string,
): RetrySchedule {
  if (attemptNumber >= 3) {
    return { shouldRetry: false, nextRetryAt: null, dunningLevel: 'final_notice' };
  }

  const base = new Date(lastAttemptDate);
  let daysToAdd: number;
  let dunningLevel: RetrySchedule['dunningLevel'];

  if (attemptNumber === 1) {
    daysToAdd = 3;
    dunningLevel = 'reminder';
  } else {
    // attemptNumber === 2
    daysToAdd = 7;
    dunningLevel = 'warning';
  }

  const nextDate = new Date(base);
  nextDate.setDate(nextDate.getDate() + daysToAdd);

  return {
    shouldRetry: true,
    nextRetryAt: nextDate.toISOString(),
    dunningLevel,
  };
}

/**
 * Computes a late fee amount based on a simple percentage of overdue balance.
 * @param overdueAmountCents - The overdue balance in cents
 * @param feePercentBps - Fee as basis points of overdue amount (e.g., 150 = 1.5%)
 * @param minimumFeeCents - Minimum fee amount in cents
 * @param maximumFeeCents - Maximum fee amount in cents (0 = no cap)
 * @returns Fee amount in cents
 */
export function computeLateFee(
  overdueAmountCents: number,
  feePercentBps: number,
  minimumFeeCents: number = 0,
  maximumFeeCents: number = 0,
): number {
  if (overdueAmountCents <= 0) return 0;

  const computed = Math.round((overdueAmountCents * feePercentBps) / 10000);
  let fee = Math.max(computed, minimumFeeCents);
  if (maximumFeeCents > 0) {
    fee = Math.min(fee, maximumFeeCents);
  }
  return fee;
}
