import { ValidationError } from '@oppsera/shared';

export function checkCreditLimit(
  billingAccount: { creditLimitCents: number | null; currentBalanceCents: number; status: string },
  chargeAmountCents: number,
): void {
  if (billingAccount.creditLimitCents === null) return; // no limit

  if (billingAccount.status !== 'active') {
    throw new ValidationError('Billing account is suspended');
  }

  const projectedBalance = Number(billingAccount.currentBalanceCents) + chargeAmountCents;
  if (projectedBalance > billingAccount.creditLimitCents) {
    throw new ValidationError('House account limit exceeded');
  }
}

export async function checkSpendingLimit(
  member: { chargeAllowed: boolean; spendingLimitCents: number | null },
  cycleChargesTotal: number,
  chargeAmountCents: number,
): Promise<void> {
  if (!member.chargeAllowed) {
    throw new ValidationError('Charge not allowed for this member');
  }
  if (member.spendingLimitCents === null) return; // no limit

  if (cycleChargesTotal + chargeAmountCents > member.spendingLimitCents) {
    throw new ValidationError('Spending limit exceeded');
  }
}
