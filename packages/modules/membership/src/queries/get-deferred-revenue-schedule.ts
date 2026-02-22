import { eq, and, asc, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { initiationContracts, initiationAmortSchedule } from '@oppsera/db';

export interface GetDeferredRevenueScheduleInput {
  tenantId: string;
  membershipAccountId?: string; // Optional filter
  asOfDate?: string; // ISO date, defaults to today
}

export interface DeferredRevenueEntry {
  contractId: string;
  membershipAccountId: string;
  contractDate: string;
  totalFeeCents: number;
  recognizedCents: number;
  deferredCents: number;
  clubModel: string; // from recognitionPolicySnapshot
  nextRecognitionDate: string | null;
}

export interface DeferredRevenueScheduleResult {
  entries: DeferredRevenueEntry[];
  totalDeferredCents: number;
  totalRecognizedCents: number;
}

export async function getDeferredRevenueSchedule(
  input: GetDeferredRevenueScheduleInput,
): Promise<DeferredRevenueScheduleResult> {
  return withTenant(input.tenantId, async (tx) => {
    // Build conditions: active or paid_off contracts
    const conditions = [
      eq(initiationContracts.tenantId, input.tenantId),
      inArray(initiationContracts.status, ['active', 'paid_off']),
    ];

    if (input.membershipAccountId) {
      conditions.push(
        eq(initiationContracts.membershipAccountId, input.membershipAccountId),
      );
    }

    // Fetch matching contracts
    const contractRows = await (tx as any)
      .select({
        id: initiationContracts.id,
        membershipAccountId: initiationContracts.membershipAccountId,
        contractDate: initiationContracts.contractDate,
        initiationFeeCents: initiationContracts.initiationFeeCents,
        paidPrincipalCents: initiationContracts.paidPrincipalCents,
        paidInterestCents: initiationContracts.paidInterestCents,
        recognitionPolicySnapshot: initiationContracts.recognitionPolicySnapshot,
      })
      .from(initiationContracts)
      .where(and(...conditions))
      .orderBy(asc(initiationContracts.contractDate));

    let totalDeferredCents = 0;
    let totalRecognizedCents = 0;

    const entries: DeferredRevenueEntry[] = [];

    for (const row of contractRows as any[]) {
      const contractId = String(row.id);
      const initiationFee = Number(row.initiationFeeCents);
      const paidPrincipal = Number(row.paidPrincipalCents);
      const paidInterest = Number(row.paidInterestCents);

      // Recognized = principal + interest paid so far
      const recognizedCents = paidPrincipal + paidInterest;
      // Deferred = total fee minus what has been recognized (minimum 0)
      const deferredCents = Math.max(0, initiationFee - recognizedCents);

      // Extract clubModel from JSONB snapshot
      const snapshot = (row.recognitionPolicySnapshot as Record<string, unknown>) ?? {};
      const clubModel = snapshot.clubModel
        ? String(snapshot.clubModel)
        : 'for_profit';

      // Find next scheduled payment date for recognition timeline
      const [nextScheduled] = await (tx as any)
        .select({
          dueDate: initiationAmortSchedule.dueDate,
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

      const nextRecognitionDate = nextScheduled
        ? (nextScheduled.dueDate instanceof Date
          ? nextScheduled.dueDate.toISOString()
          : String(nextScheduled.dueDate))
        : null;

      totalRecognizedCents += recognizedCents;
      totalDeferredCents += deferredCents;

      entries.push({
        contractId,
        membershipAccountId: String(row.membershipAccountId),
        contractDate: row.contractDate instanceof Date
          ? row.contractDate.toISOString()
          : String(row.contractDate),
        totalFeeCents: initiationFee,
        recognizedCents,
        deferredCents,
        clubModel,
        nextRecognitionDate,
      });
    }

    return {
      entries,
      totalDeferredCents,
      totalRecognizedCents,
    };
  });
}
