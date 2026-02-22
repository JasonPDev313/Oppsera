export type ProrationPolicy = 'daily' | 'half_month' | 'none';

/**
 * Computes the prorated amount for a partial billing period.
 *
 * @param amountCents - Full period charge in cents
 * @param policy - Proration policy to apply
 * @param periodStart - ISO date string for period start (YYYY-MM-DD)
 * @param periodEnd - ISO date string for period end (YYYY-MM-DD)
 * @param effectiveDate - ISO date string for when the member actually starts (YYYY-MM-DD)
 * @returns Prorated amount in cents (integer, rounded)
 */
export function computeProration(
  amountCents: number,
  policy: ProrationPolicy,
  periodStart: string,
  periodEnd: string,
  effectiveDate: string,
): number {
  if (policy === 'none') {
    return amountCents;
  }

  if (policy === 'daily') {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const effective = new Date(effectiveDate);

    // Total days in the period (inclusive of end)
    const totalDays = Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

    // Remaining days from effective date through period end (inclusive)
    const remainingDays = Math.round(
      (end.getTime() - effective.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

    if (remainingDays <= 0) return 0;
    if (remainingDays >= totalDays) return amountCents;

    return Math.round((remainingDays / totalDays) * amountCents);
  }

  if (policy === 'half_month') {
    const effective = new Date(effectiveDate);
    const dayOfMonth = effective.getUTCDate();

    // First half (day 1-15) = full amount; second half = 50%
    if (dayOfMonth <= 15) {
      return amountCents;
    }
    return Math.round(amountCents * 0.5);
  }

  // Fallback: full amount for unknown policies
  return amountCents;
}

/**
 * Computes the next billing date by advancing from currentDate by one billing frequency period.
 */
export function advanceByFrequency(
  currentDate: string,
  frequency: string,
): string {
  const d = new Date(currentDate);
  switch (frequency) {
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'semi_annual':
      d.setMonth(d.getMonth() + 6);
      break;
    case 'annual':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      // one_time or unknown — no advancement
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return d.toISOString().split('T')[0]!;
}

/**
 * Returns the end date of the billing period starting from `startDate`
 * for the given frequency. The end date is the day before the next period starts.
 */
export function computePeriodEnd(
  startDate: string,
  frequency: string,
): string {
  const nextStart = new Date(advanceByFrequency(startDate, frequency));
  nextStart.setDate(nextStart.getDate() - 1);
  return nextStart.toISOString().split('T')[0]!;
}
