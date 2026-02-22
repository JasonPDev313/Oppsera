import { eq, and, asc, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { initiationContracts, initiationAmortSchedule } from '@oppsera/db';

export interface GetInitiationSummaryInput {
  tenantId: string;
  membershipAccountId: string;
}

export interface InitiationContractSummary {
  id: string;
  contractDate: string;
  initiationFeeCents: number;
  downPaymentCents: number;
  financedPrincipalCents: number;
  aprBps: number;
  termMonths: number;
  status: string;
  paidPrincipalCents: number;
  paidInterestCents: number;
  remainingPrincipalCents: number;
  nextPaymentDate: string | null;
  nextPaymentCents: number | null;
  progressPercent: number; // 0-100
}

export async function getInitiationSummary(
  input: GetInitiationSummaryInput,
): Promise<InitiationContractSummary[]> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch all contracts for this membership account
    const contractRows = await (tx as any)
      .select({
        id: initiationContracts.id,
        contractDate: initiationContracts.contractDate,
        initiationFeeCents: initiationContracts.initiationFeeCents,
        downPaymentCents: initiationContracts.downPaymentCents,
        financedPrincipalCents: initiationContracts.financedPrincipalCents,
        aprBps: initiationContracts.aprBps,
        termMonths: initiationContracts.termMonths,
        status: initiationContracts.status,
        paidPrincipalCents: initiationContracts.paidPrincipalCents,
        paidInterestCents: initiationContracts.paidInterestCents,
      })
      .from(initiationContracts)
      .where(
        and(
          eq(initiationContracts.tenantId, input.tenantId),
          eq(initiationContracts.membershipAccountId, input.membershipAccountId),
        ),
      )
      .orderBy(desc(initiationContracts.contractDate));

    // For each contract, find the next scheduled payment
    const summaries: InitiationContractSummary[] = [];

    for (const row of contractRows as any[]) {
      const contractId = String(row.id);
      const financedPrincipal = Number(row.financedPrincipalCents);
      const paidPrincipal = Number(row.paidPrincipalCents);

      // Find next scheduled payment (first entry with status='scheduled', ordered by periodIndex)
      const [nextPayment] = await (tx as any)
        .select({
          dueDate: initiationAmortSchedule.dueDate,
          paymentCents: initiationAmortSchedule.paymentCents,
        })
        .from(initiationAmortSchedule)
        .where(
          and(
            eq(initiationAmortSchedule.tenantId, input.tenantId),
            eq(initiationAmortSchedule.contractId, contractId),
            eq(initiationAmortSchedule.status, 'scheduled'),
          ),
        )
        .orderBy(asc(initiationAmortSchedule.periodIndex))
        .limit(1);

      const remainingPrincipalCents = financedPrincipal - paidPrincipal;
      const progressPercent =
        financedPrincipal > 0
          ? Math.round((paidPrincipal / financedPrincipal) * 100)
          : 100;

      summaries.push({
        id: contractId,
        contractDate: row.contractDate instanceof Date
          ? row.contractDate.toISOString()
          : String(row.contractDate),
        initiationFeeCents: Number(row.initiationFeeCents),
        downPaymentCents: Number(row.downPaymentCents),
        financedPrincipalCents: financedPrincipal,
        aprBps: Number(row.aprBps),
        termMonths: Number(row.termMonths),
        status: String(row.status),
        paidPrincipalCents: paidPrincipal,
        paidInterestCents: Number(row.paidInterestCents),
        remainingPrincipalCents,
        nextPaymentDate: nextPayment
          ? (nextPayment.dueDate instanceof Date
            ? nextPayment.dueDate.toISOString()
            : String(nextPayment.dueDate))
          : null,
        nextPaymentCents: nextPayment
          ? Number(nextPayment.paymentCents)
          : null,
        progressPercent,
      });
    }

    return summaries;
  });
}
