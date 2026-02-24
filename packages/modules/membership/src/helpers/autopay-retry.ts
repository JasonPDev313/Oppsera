// ── Autopay Retry Engine ──────────────────────────────────────────
// Pure computation functions for retry scheduling.
// No DB access, no side effects.

export interface RetrySchedule {
  shouldRetry: boolean;
  nextRetryAt: string | null; // ISO datetime
  dunningLevel: 'none' | 'reminder' | 'warning' | 'final_notice';
  /** When true, autopay should be suspended and the member notified. */
  suspendAutopay?: boolean;
  /** Reason for suspension (e.g., ACH return code description). */
  suspendReason?: string;
}

/**
 * Computes the next retry schedule for CARD payments based on the current attempt number.
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

// ── ACH Return Codes that are retryable ──────────────────────────
// R01 (NSF) and R09 (Uncollected Funds) may be retried per NACHA rules.
// All other return codes should suspend autopay immediately.
const ACH_RETRYABLE_CODES = new Set(['R01', 'R09']);

// Non-retryable codes that indicate the bank account is permanently invalid.
// These require the member to update their payment method.
const ACH_SUSPEND_CODES = new Set([
  'R02', // Account Closed
  'R03', // No Account / Unable to Locate
  'R04', // Invalid Account Number
  'R05', // Unauthorized Debit
  'R07', // Authorization Revoked
  'R08', // Payment Stopped
  'R10', // Customer Advises Not Authorized
  'R16', // Account Frozen
  'R20', // Non-Transaction Account
  'R29', // Corporate Customer Not Authorized
]);

/**
 * Computes the next retry schedule for ACH payments based on the return code.
 *
 * ACH retry rules differ from card declines:
 * - R01 (NSF) / R09 (Uncollected): retryable in 2 business days, max 2 re-presentations (NACHA limit)
 * - R02 (Closed), R03 (Invalid), R07 (Revoked), etc.: do NOT retry, suspend autopay, notify member
 * - Unknown codes: treated as non-retryable (safer default)
 *
 * @param attemptNumber - Current attempt number (1-based)
 * @param lastAttemptDate - ISO date of the last attempt
 * @param returnCode - ACH return code (e.g., 'R01', 'R02')
 * @param returnDescription - Optional description for notification context
 */
export function computeAchRetrySchedule(
  attemptNumber: number,
  lastAttemptDate: string,
  returnCode: string,
  returnDescription?: string,
): RetrySchedule {
  const normalizedCode = returnCode.toUpperCase();

  // Non-retryable return codes — suspend immediately
  if (!ACH_RETRYABLE_CODES.has(normalizedCode)) {
    return {
      shouldRetry: false,
      nextRetryAt: null,
      dunningLevel: 'final_notice',
      suspendAutopay: true,
      suspendReason: returnDescription
        ? `ACH return ${normalizedCode}: ${returnDescription}`
        : `ACH return ${normalizedCode}`,
    };
  }

  // Retryable codes (R01, R09) — NACHA allows up to 2 re-presentations
  // Total attempts: original + 2 retries = 3 max
  if (attemptNumber >= 3) {
    return {
      shouldRetry: false,
      nextRetryAt: null,
      dunningLevel: 'final_notice',
      suspendAutopay: true,
      suspendReason: `ACH return ${normalizedCode} after ${attemptNumber} attempts`,
    };
  }

  // Retry in 2 business days (ACH processing time)
  const base = new Date(lastAttemptDate);
  const nextDate = addBusinessDays(base, 2);

  const dunningLevel: RetrySchedule['dunningLevel'] = attemptNumber === 1 ? 'reminder' : 'warning';

  return {
    shouldRetry: true,
    nextRetryAt: nextDate.toISOString(),
    dunningLevel,
  };
}

/**
 * Determines if an ACH return code should suspend autopay immediately
 * (i.e., the bank account is permanently invalid).
 */
export function shouldSuspendAutopayForReturn(returnCode: string): boolean {
  return ACH_SUSPEND_CODES.has(returnCode.toUpperCase()) || !ACH_RETRYABLE_CODES.has(returnCode.toUpperCase());
}

/**
 * Add N business days (Mon-Fri) to a date, skipping weekends.
 */
function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      added++;
    }
  }
  return result;
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
