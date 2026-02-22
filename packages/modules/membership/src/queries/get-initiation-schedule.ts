import { eq, and, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { initiationContracts, initiationAmortSchedule } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetInitiationScheduleInput {
  tenantId: string;
  contractId: string;
}

export interface InitiationScheduleEntry {
  id: string;
  periodIndex: number;
  dueDate: string;
  paymentCents: number;
  principalCents: number;
  interestCents: number;
  status: string;
  billedAt: string | null;
  paidAt: string | null;
}

export interface InitiationScheduleResult {
  contract: {
    id: string;
    membershipAccountId: string;
    contractDate: string;
    initiationFeeCents: number;
    downPaymentCents: number;
    financedPrincipalCents: number;
    aprBps: number;
    termMonths: number;
    status: string;
    paidPrincipalCents: number;
    paidInterestCents: number;
    recognitionPolicySnapshot: Record<string, unknown>;
  };
  schedule: InitiationScheduleEntry[];
}

export async function getInitiationSchedule(
  input: GetInitiationScheduleInput,
): Promise<InitiationScheduleResult> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch contract
    const [contract] = await (tx as any)
      .select({
        id: initiationContracts.id,
        membershipAccountId: initiationContracts.membershipAccountId,
        contractDate: initiationContracts.contractDate,
        initiationFeeCents: initiationContracts.initiationFeeCents,
        downPaymentCents: initiationContracts.downPaymentCents,
        financedPrincipalCents: initiationContracts.financedPrincipalCents,
        aprBps: initiationContracts.aprBps,
        termMonths: initiationContracts.termMonths,
        status: initiationContracts.status,
        paidPrincipalCents: initiationContracts.paidPrincipalCents,
        paidInterestCents: initiationContracts.paidInterestCents,
        recognitionPolicySnapshot: initiationContracts.recognitionPolicySnapshot,
      })
      .from(initiationContracts)
      .where(
        and(
          eq(initiationContracts.tenantId, input.tenantId),
          eq(initiationContracts.id, input.contractId),
        ),
      )
      .limit(1);

    if (!contract) {
      throw new NotFoundError('InitiationContract', input.contractId);
    }

    // Fetch amortization schedule entries ordered by period
    const scheduleRows = await (tx as any)
      .select({
        id: initiationAmortSchedule.id,
        periodIndex: initiationAmortSchedule.periodIndex,
        dueDate: initiationAmortSchedule.dueDate,
        paymentCents: initiationAmortSchedule.paymentCents,
        principalCents: initiationAmortSchedule.principalCents,
        interestCents: initiationAmortSchedule.interestCents,
        status: initiationAmortSchedule.status,
        billedAt: initiationAmortSchedule.billedAt,
        paidAt: initiationAmortSchedule.paidAt,
      })
      .from(initiationAmortSchedule)
      .where(
        and(
          eq(initiationAmortSchedule.tenantId, input.tenantId),
          eq(initiationAmortSchedule.contractId, input.contractId),
        ),
      )
      .orderBy(asc(initiationAmortSchedule.periodIndex));

    // Map schedule entries
    const schedule: InitiationScheduleEntry[] = (scheduleRows as any[]).map((row) => ({
      id: String(row.id),
      periodIndex: Number(row.periodIndex),
      dueDate: row.dueDate instanceof Date
        ? row.dueDate.toISOString()
        : String(row.dueDate),
      paymentCents: Number(row.paymentCents),
      principalCents: Number(row.principalCents),
      interestCents: Number(row.interestCents),
      status: String(row.status),
      billedAt: row.billedAt instanceof Date
        ? row.billedAt.toISOString()
        : (row.billedAt ? String(row.billedAt) : null),
      paidAt: row.paidAt instanceof Date
        ? row.paidAt.toISOString()
        : (row.paidAt ? String(row.paidAt) : null),
    }));

    return {
      contract: {
        id: String(contract.id),
        membershipAccountId: String(contract.membershipAccountId),
        contractDate: contract.contractDate instanceof Date
          ? contract.contractDate.toISOString()
          : String(contract.contractDate),
        initiationFeeCents: Number(contract.initiationFeeCents),
        downPaymentCents: Number(contract.downPaymentCents),
        financedPrincipalCents: Number(contract.financedPrincipalCents),
        aprBps: Number(contract.aprBps),
        termMonths: Number(contract.termMonths),
        status: String(contract.status),
        paidPrincipalCents: Number(contract.paidPrincipalCents),
        paidInterestCents: Number(contract.paidInterestCents),
        recognitionPolicySnapshot:
          (contract.recognitionPolicySnapshot as Record<string, unknown>) ?? {},
      },
      schedule,
    };
  });
}
