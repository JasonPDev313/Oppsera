import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { initiationContracts, initiationAmortSchedule } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { ComputePayoffQuoteInput } from '../validation';
import { computePayoffQuote } from '../helpers/amortization';

export interface PayoffQuoteResult {
  contractId: string;
  payoffDate: string;
  payoffAmountCents: number;
  accruedInterestCents: number;
  principalCents: number;
}

export async function computePayoffQuoteCommand(
  ctx: RequestContext,
  input: ComputePayoffQuoteInput,
): Promise<PayoffQuoteResult> {
  const payoffDate = input.payoffDate ?? new Date().toISOString().split('T')[0]!;

  return withTenant(ctx.tenantId, async (tx) => {
    // Find the contract
    const [contract] = await (tx as any)
      .select({
        id: initiationContracts.id,
        status: initiationContracts.status,
        financedPrincipalCents: initiationContracts.financedPrincipalCents,
        paidPrincipalCents: initiationContracts.paidPrincipalCents,
        aprBps: initiationContracts.aprBps,
        contractDate: initiationContracts.contractDate,
      })
      .from(initiationContracts)
      .where(
        and(
          eq(initiationContracts.tenantId, ctx.tenantId),
          eq(initiationContracts.id, input.contractId),
        ),
      )
      .limit(1);

    if (!contract) {
      throw new NotFoundError('InitiationContract', input.contractId);
    }

    if (contract.status !== 'active') {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot compute payoff for contract with status '${contract.status}'`,
        422,
      );
    }

    const remainingPrincipal = contract.financedPrincipalCents - contract.paidPrincipalCents;

    // Find the last paid schedule entry to determine the last payment date
    const [lastPaid] = await (tx as any)
      .select({
        dueDate: initiationAmortSchedule.dueDate,
        paidAt: initiationAmortSchedule.paidAt,
      })
      .from(initiationAmortSchedule)
      .where(
        and(
          eq(initiationAmortSchedule.tenantId, ctx.tenantId),
          eq(initiationAmortSchedule.contractId, input.contractId),
          eq(initiationAmortSchedule.status, 'paid'),
        ),
      )
      .orderBy(desc(initiationAmortSchedule.periodIndex))
      .limit(1);

    // If no payments have been made yet, use the contract date as the base
    const lastPaymentDate = lastPaid?.dueDate ?? contract.contractDate;

    const quote = computePayoffQuote(
      remainingPrincipal,
      contract.aprBps,
      lastPaymentDate,
      payoffDate,
    );

    return {
      contractId: input.contractId,
      payoffDate,
      payoffAmountCents: quote.payoffAmountCents,
      accruedInterestCents: quote.accruedInterestCents,
      principalCents: quote.principalCents,
    };
  });
}
