// ── Amortization Engine ──────────────────────────────────────────
// Pure computation functions for initiation fee financing.
// No DB access, no side effects — safe to use from any context.

export interface AmortScheduleEntry {
  periodIndex: number;
  dueDate: string; // ISO date
  paymentCents: number;
  principalCents: number;
  interestCents: number;
}

/**
 * Clamps a day-of-month to the last valid day of the given year/month.
 * E.g., day 31 in February → 28 (or 29 in a leap year).
 */
function clampDay(year: number, month: number, desiredDay: number): number {
  // month is 0-based for Date constructor, but we need the last day of `month`
  // new Date(year, month + 1, 0) gives the last day of `month`
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(desiredDay, lastDay);
}

/**
 * Advances a date by `months` months, pinning to `paymentDayOfMonth`
 * and clamping to end-of-month when necessary.
 */
function advanceMonth(
  baseYear: number,
  baseMonth: number,
  monthsToAdd: number,
  paymentDayOfMonth: number,
): string {
  let year = baseYear;
  let month = baseMonth + monthsToAdd;

  // Normalize month overflow
  year += Math.floor(month / 12);
  month = month % 12;
  if (month < 0) {
    month += 12;
    year -= 1;
  }

  const day = clampDay(year, month, paymentDayOfMonth);
  const d = new Date(year, month, day);
  return d.toISOString().split('T')[0]!;
}

/**
 * Generates a full amortization schedule for a financed initiation fee.
 * Uses standard amortization formula with monthly compounding.
 * All amounts in cents (integer).
 *
 * @param principalCents - Financed amount after down payment (cents)
 * @param aprBps - Annual percentage rate in basis points (e.g., 500 = 5.00%)
 * @param termMonths - Number of monthly installments
 * @param startDate - ISO date for the first payment (YYYY-MM-DD)
 * @param paymentDayOfMonth - Day of month for payments (1-28)
 * @returns Array of AmortScheduleEntry
 */
export function generateAmortSchedule(
  principalCents: number,
  aprBps: number,
  termMonths: number,
  startDate: string,
  paymentDayOfMonth: number,
): AmortScheduleEntry[] {
  if (principalCents <= 0 || termMonths <= 0) {
    return [];
  }

  const startParts = startDate.split('-');
  const baseYear = parseInt(startParts[0]!, 10);
  const baseMonth = parseInt(startParts[1]!, 10) - 1; // 0-based

  // ── 0% APR: simple equal division ──
  if (aprBps === 0) {
    const basePayment = Math.floor(principalCents / termMonths);
    const remainder = principalCents - basePayment * termMonths;
    const entries: AmortScheduleEntry[] = [];

    for (let i = 0; i < termMonths; i++) {
      const dueDate = advanceMonth(baseYear, baseMonth, i, paymentDayOfMonth);
      // Last payment absorbs remainder
      const payment = i === termMonths - 1 ? basePayment + remainder : basePayment;

      entries.push({
        periodIndex: i,
        dueDate,
        paymentCents: payment,
        principalCents: payment,
        interestCents: 0,
      });
    }

    return entries;
  }

  // ── Interest-bearing: standard amortization formula ──
  const monthlyRate = aprBps / 10000 / 12;
  const n = termMonths;

  // Fixed monthly payment = P * [r(1+r)^n] / [(1+r)^n - 1]
  const compoundFactor = Math.pow(1 + monthlyRate, n);
  const fixedPaymentRaw = principalCents * (monthlyRate * compoundFactor) / (compoundFactor - 1);
  const fixedPaymentCents = Math.round(fixedPaymentRaw);

  const entries: AmortScheduleEntry[] = [];
  let remainingPrincipal = principalCents;

  for (let i = 0; i < termMonths; i++) {
    const dueDate = advanceMonth(baseYear, baseMonth, i, paymentDayOfMonth);

    const interestForPeriod = Math.round(remainingPrincipal * monthlyRate);

    if (i === termMonths - 1) {
      // Last payment: pay off everything remaining
      const principalForPeriod = remainingPrincipal;
      const totalPayment = principalForPeriod + interestForPeriod;

      entries.push({
        periodIndex: i,
        dueDate,
        paymentCents: totalPayment,
        principalCents: principalForPeriod,
        interestCents: interestForPeriod,
      });
      remainingPrincipal = 0;
    } else {
      const principalForPeriod = fixedPaymentCents - interestForPeriod;

      entries.push({
        periodIndex: i,
        dueDate,
        paymentCents: fixedPaymentCents,
        principalCents: principalForPeriod,
        interestCents: interestForPeriod,
      });
      remainingPrincipal -= principalForPeriod;
    }
  }

  return entries;
}

/**
 * Computes the payoff amount as of a given date.
 * Remaining principal + accrued interest from last payment to payoff date.
 *
 * @param remainingPrincipalCents - Outstanding principal balance (cents)
 * @param aprBps - Annual percentage rate in basis points
 * @param lastPaymentDate - ISO date of last payment (YYYY-MM-DD)
 * @param payoffDate - ISO date for payoff calculation (YYYY-MM-DD)
 * @returns Payoff quote with breakdown
 */
export function computePayoffQuote(
  remainingPrincipalCents: number,
  aprBps: number,
  lastPaymentDate: string,
  payoffDate: string,
): { payoffAmountCents: number; accruedInterestCents: number; principalCents: number } {
  if (remainingPrincipalCents <= 0) {
    return {
      payoffAmountCents: 0,
      accruedInterestCents: 0,
      principalCents: 0,
    };
  }

  if (aprBps === 0) {
    return {
      payoffAmountCents: remainingPrincipalCents,
      accruedInterestCents: 0,
      principalCents: remainingPrincipalCents,
    };
  }

  const dailyRate = aprBps / 10000 / 365;

  const lastDate = new Date(lastPaymentDate);
  const payoff = new Date(payoffDate);
  const daysDiff = Math.max(0, Math.round((payoff.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)));

  const accruedInterestCents = Math.round(remainingPrincipalCents * dailyRate * daysDiff);
  const payoffAmountCents = remainingPrincipalCents + accruedInterestCents;

  return {
    payoffAmountCents,
    accruedInterestCents,
    principalCents: remainingPrincipalCents,
  };
}

/**
 * Recalculates remaining schedule after an extra principal payment.
 * Returns new schedule entries from the current period forward.
 * The term is kept the same; monthly payment amounts shrink.
 *
 * @param remainingPrincipalCents - Principal balance after extra payment (cents)
 * @param aprBps - Annual percentage rate in basis points
 * @param remainingTermMonths - Number of installments left
 * @param nextDueDate - ISO date for the next payment (YYYY-MM-DD)
 * @param paymentDayOfMonth - Day of month for payments (1-28)
 * @returns Recalculated schedule entries
 */
export function recalculateAfterExtraPrincipal(
  remainingPrincipalCents: number,
  aprBps: number,
  remainingTermMonths: number,
  nextDueDate: string,
  paymentDayOfMonth: number,
): AmortScheduleEntry[] {
  // Delegate to the same schedule generator with the new balance
  return generateAmortSchedule(
    remainingPrincipalCents,
    aprBps,
    remainingTermMonths,
    nextDueDate,
    paymentDayOfMonth,
  );
}
