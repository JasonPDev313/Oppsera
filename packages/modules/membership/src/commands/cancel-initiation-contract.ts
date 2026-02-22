import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { initiationContracts } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { CancelInitiationContractInput } from '../validation';

export async function cancelInitiationContract(
  ctx: RequestContext,
  input: CancelInitiationContractInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate the contract exists
    const [contract] = await (tx as any)
      .select({
        id: initiationContracts.id,
        status: initiationContracts.status,
        membershipAccountId: initiationContracts.membershipAccountId,
        financedPrincipalCents: initiationContracts.financedPrincipalCents,
        paidPrincipalCents: initiationContracts.paidPrincipalCents,
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
        `Cannot cancel contract with status '${contract.status}'; only active contracts can be cancelled`,
        422,
      );
    }

    const now = new Date();

    // Update contract status to cancelled
    await (tx as any)
      .update(initiationContracts)
      .set({
        status: 'cancelled',
        updatedAt: now,
      })
      .where(
        and(
          eq(initiationContracts.tenantId, ctx.tenantId),
          eq(initiationContracts.id, input.contractId),
        ),
      );

    const event = buildEventFromContext(ctx, 'membership.initiation.contract.cancelled.v1', {
      contractId: input.contractId,
      membershipAccountId: contract.membershipAccountId,
      reason: input.reason,
      financedPrincipalCents: contract.financedPrincipalCents,
      paidPrincipalCents: contract.paidPrincipalCents,
      outstandingPrincipalCents: contract.financedPrincipalCents - contract.paidPrincipalCents,
    });

    return {
      result: {
        contractId: input.contractId,
        status: 'cancelled' as const,
        reason: input.reason,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'membership.initiation.contract.cancelled', 'initiation_contract', result.contractId);
  return result;
}
