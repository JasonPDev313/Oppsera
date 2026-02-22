import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { initiationContracts, initiationAmortSchedule } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { BillInitiationInstallmentInput } from '../validation';

export async function billInitiationInstallment(
  ctx: RequestContext,
  input: BillInitiationInstallmentInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate the contract exists and is active
    const [contract] = await (tx as any)
      .select({
        id: initiationContracts.id,
        status: initiationContracts.status,
        membershipAccountId: initiationContracts.membershipAccountId,
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
        `Cannot bill installment on contract with status '${contract.status}'`,
        422,
      );
    }

    // Find the schedule entry by contractId + periodIndex
    const [scheduleEntry] = await (tx as any)
      .select({
        id: initiationAmortSchedule.id,
        status: initiationAmortSchedule.status,
        dueDate: initiationAmortSchedule.dueDate,
        paymentCents: initiationAmortSchedule.paymentCents,
        principalCents: initiationAmortSchedule.principalCents,
        interestCents: initiationAmortSchedule.interestCents,
      })
      .from(initiationAmortSchedule)
      .where(
        and(
          eq(initiationAmortSchedule.tenantId, ctx.tenantId),
          eq(initiationAmortSchedule.contractId, input.contractId),
          eq(initiationAmortSchedule.periodIndex, input.periodIndex),
        ),
      )
      .limit(1);

    if (!scheduleEntry) {
      throw new NotFoundError(
        'InitiationAmortSchedule',
        `${input.contractId}:period-${input.periodIndex}`,
      );
    }

    if (scheduleEntry.status !== 'scheduled') {
      throw new AppError(
        'VALIDATION_ERROR',
        `Schedule entry is already '${scheduleEntry.status}', cannot bill again`,
        409,
      );
    }

    const now = new Date();

    // Update schedule entry to billed
    await (tx as any)
      .update(initiationAmortSchedule)
      .set({
        status: 'billed',
        billedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(initiationAmortSchedule.tenantId, ctx.tenantId),
          eq(initiationAmortSchedule.id, scheduleEntry.id),
        ),
      );

    const event = buildEventFromContext(ctx, 'membership.initiation.installment.billed.v1', {
      contractId: input.contractId,
      membershipAccountId: contract.membershipAccountId,
      scheduleEntryId: scheduleEntry.id,
      periodIndex: input.periodIndex,
      dueDate: scheduleEntry.dueDate,
      paymentCents: scheduleEntry.paymentCents,
      principalCents: scheduleEntry.principalCents,
      interestCents: scheduleEntry.interestCents,
    });

    return {
      result: {
        scheduleEntryId: scheduleEntry.id,
        contractId: input.contractId,
        periodIndex: input.periodIndex,
        status: 'billed' as const,
        billedAt: now.toISOString(),
        paymentCents: scheduleEntry.paymentCents,
        principalCents: scheduleEntry.principalCents,
        interestCents: scheduleEntry.interestCents,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'membership.initiation.installment.billed', 'initiation_amort_schedule', result.scheduleEntryId);
  return result;
}
