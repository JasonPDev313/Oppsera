import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { initiationContracts } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { RecordExtraPrincipalInput } from '../validation';

export async function recordExtraPrincipal(
  ctx: RequestContext,
  input: RecordExtraPrincipalInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate the contract exists and is active
    const [contract] = await (tx as any)
      .select({
        id: initiationContracts.id,
        status: initiationContracts.status,
        membershipAccountId: initiationContracts.membershipAccountId,
        financedPrincipalCents: initiationContracts.financedPrincipalCents,
        paidPrincipalCents: initiationContracts.paidPrincipalCents,
        aprBps: initiationContracts.aprBps,
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
        `Cannot record extra principal on contract with status '${contract.status}'`,
        422,
      );
    }

    // Compute remaining principal
    const remainingPrincipal = contract.financedPrincipalCents - contract.paidPrincipalCents;

    if (input.amountCents > remainingPrincipal) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Extra principal amount (${input.amountCents}) exceeds remaining principal (${remainingPrincipal})`,
        422,
      );
    }

    const now = new Date();
    const newPaidPrincipal = contract.paidPrincipalCents + input.amountCents;
    const newRemaining = contract.financedPrincipalCents - newPaidPrincipal;
    const newStatus = newRemaining <= 0 ? 'paid_off' : 'active';

    // Update contract
    await (tx as any)
      .update(initiationContracts)
      .set({
        paidPrincipalCents: newPaidPrincipal,
        status: newStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(initiationContracts.tenantId, ctx.tenantId),
          eq(initiationContracts.id, input.contractId),
        ),
      );

    const event = buildEventFromContext(ctx, 'membership.initiation.extra_principal.recorded.v1', {
      contractId: input.contractId,
      membershipAccountId: contract.membershipAccountId,
      amountCents: input.amountCents,
      effectiveDate: input.effectiveDate ?? now.toISOString().split('T')[0],
      previousPaidPrincipalCents: contract.paidPrincipalCents,
      newPaidPrincipalCents: newPaidPrincipal,
      remainingPrincipalCents: newRemaining,
      newStatus,
    });

    return {
      result: {
        contractId: input.contractId,
        amountCents: input.amountCents,
        paidPrincipalCents: newPaidPrincipal,
        remainingPrincipalCents: newRemaining,
        status: newStatus,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'membership.initiation.extra_principal.recorded', 'initiation_contract', result.contractId);
  return result;
}
