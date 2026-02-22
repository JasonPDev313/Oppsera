import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  initiationContracts,
  initiationAmortSchedule,
  membershipAccounts,
  membershipAccountingSettings,
} from '@oppsera/db';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import type { CreateInitiationContractInput } from '../validation';
import { generateAmortSchedule } from '../helpers/amortization';

export async function createInitiationContract(
  ctx: RequestContext,
  input: CreateInitiationContractInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate membership account exists and belongs to this tenant
    const [account] = await (tx as any)
      .select({ id: membershipAccounts.id, status: membershipAccounts.status })
      .from(membershipAccounts)
      .where(
        and(
          eq(membershipAccounts.tenantId, ctx.tenantId),
          eq(membershipAccounts.id, input.membershipAccountId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new NotFoundError('MembershipAccount', input.membershipAccountId);
    }

    // Fetch tenant accounting settings for recognition policy snapshot
    const [settings] = await (tx as any)
      .select()
      .from(membershipAccountingSettings)
      .where(eq(membershipAccountingSettings.tenantId, ctx.tenantId))
      .limit(1);

    // Build the recognition policy snapshot (GAAP compliance: freeze at contract time)
    const recognitionPolicySnapshot: Record<string, unknown> = {
      clubModel: settings?.clubModel ?? 'for_profit',
      recognitionPolicy: settings?.recognitionPolicy ?? null,
      defaultInitiationRevenueAccountId: settings?.defaultInitiationRevenueAccountId ?? null,
      defaultNotesReceivableAccountId: settings?.defaultNotesReceivableAccountId ?? null,
      defaultInterestIncomeAccountId: settings?.defaultInterestIncomeAccountId ?? null,
      defaultCapitalContributionAccountId: settings?.defaultCapitalContributionAccountId ?? null,
      defaultDeferredRevenueAccountId: settings?.defaultDeferredRevenueAccountId ?? null,
      snapshotAt: new Date().toISOString(),
    };

    // Compute financed principal
    const downPayment = input.downPaymentCents ?? 0;
    const financedPrincipalCents = input.initiationFeeCents - downPayment;

    if (financedPrincipalCents <= 0) {
      throw new ValidationError('Financed principal must be greater than zero (initiationFeeCents - downPaymentCents)');
    }

    // Generate the amortization schedule
    const aprBps = input.aprBps ?? 0;
    const paymentDayOfMonth = input.paymentDayOfMonth ?? 1;
    const schedule = generateAmortSchedule(
      financedPrincipalCents,
      aprBps,
      input.termMonths,
      input.contractDate,
      paymentDayOfMonth,
    );

    const contractId = generateUlid();
    const now = new Date();

    // Insert the contract
    const [contract] = await (tx as any)
      .insert(initiationContracts)
      .values({
        id: contractId,
        tenantId: ctx.tenantId,
        membershipAccountId: input.membershipAccountId,
        contractDate: input.contractDate,
        initiationFeeCents: input.initiationFeeCents,
        downPaymentCents: downPayment,
        financedPrincipalCents,
        aprBps,
        termMonths: input.termMonths,
        paymentDayOfMonth,
        status: 'active',
        recognitionPolicySnapshot,
        glInitiationRevenueAccountId: input.glInitiationRevenueAccountId
          ?? settings?.defaultInitiationRevenueAccountId ?? null,
        glNotesReceivableAccountId: input.glNotesReceivableAccountId
          ?? settings?.defaultNotesReceivableAccountId ?? null,
        glInterestIncomeAccountId: input.glInterestIncomeAccountId
          ?? settings?.defaultInterestIncomeAccountId ?? null,
        glCapitalContributionAccountId: input.glCapitalContributionAccountId
          ?? settings?.defaultCapitalContributionAccountId ?? null,
        glDeferredRevenueAccountId: input.glDeferredRevenueAccountId
          ?? settings?.defaultDeferredRevenueAccountId ?? null,
        paidPrincipalCents: 0,
        paidInterestCents: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Batch insert all schedule entries
    if (schedule.length > 0) {
      const scheduleRows = schedule.map((entry) => ({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        contractId,
        periodIndex: entry.periodIndex,
        dueDate: entry.dueDate,
        paymentCents: entry.paymentCents,
        principalCents: entry.principalCents,
        interestCents: entry.interestCents,
        status: 'scheduled',
        arTransactionId: null,
        billedAt: null,
        paidAt: null,
        createdAt: now,
        updatedAt: now,
      }));

      await (tx as any).insert(initiationAmortSchedule).values(scheduleRows);
    }

    const event = buildEventFromContext(ctx, 'membership.initiation.contract.created.v1', {
      contractId,
      membershipAccountId: input.membershipAccountId,
      initiationFeeCents: input.initiationFeeCents,
      downPaymentCents: downPayment,
      financedPrincipalCents,
      aprBps,
      termMonths: input.termMonths,
      scheduleEntries: schedule.length,
    });

    return { result: contract!, events: [event] };
  });

  await auditLog(ctx, 'membership.initiation.contract.created', 'initiation_contract', result.id);
  return result;
}
