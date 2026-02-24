import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  autopayAttempts,
  lateFeeAssessments,
  membershipHolds,
} from '@oppsera/db';

export interface GetCollectionsTimelineInput {
  tenantId: string;
  membershipAccountId: string;
}

export interface CollectionsTimelineEntry {
  id: string;
  type: 'autopay_attempt' | 'late_fee' | 'hold_placed' | 'hold_lifted';
  occurredAt: string;
  description: string;
  amountCents: number | null;
  status: string | null;
}

export type GetCollectionsTimelineResult = CollectionsTimelineEntry[];

export async function getCollectionsTimeline(
  input: GetCollectionsTimelineInput,
): Promise<GetCollectionsTimelineResult> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Fetch autopay attempts for this account
    const attemptRows = await (tx as any)
      .select({
        id: autopayAttempts.id,
        amountCents: autopayAttempts.amountCents,
        status: autopayAttempts.status,
        attemptNumber: autopayAttempts.attemptNumber,
        failureReason: autopayAttempts.failureReason,
        createdAt: autopayAttempts.createdAt,
      })
      .from(autopayAttempts)
      .where(
        and(
          eq(autopayAttempts.tenantId, input.tenantId),
          eq(autopayAttempts.membershipAccountId, input.membershipAccountId),
        ),
      )
      .orderBy(desc(autopayAttempts.createdAt))
      .limit(50);

    const attemptEntries: CollectionsTimelineEntry[] = (attemptRows as any[]).map((r) => {
      const status = String(r.status);
      const attemptNum = Number(r.attemptNumber ?? 1);
      const amountCents = Number(r.amountCents ?? 0);
      const failureReason = r.failureReason ? String(r.failureReason) : null;

      let description: string;
      if (status === 'success') {
        description = `Autopay attempt #${attemptNum} succeeded — collected $${(amountCents / 100).toFixed(2)}`;
      } else if (status === 'failed') {
        description = `Autopay attempt #${attemptNum} failed${failureReason ? `: ${failureReason}` : ''}`;
      } else if (status === 'retry') {
        description = `Autopay attempt #${attemptNum} scheduled for retry${failureReason ? ` (${failureReason})` : ''}`;
      } else {
        description = `Autopay attempt #${attemptNum} — ${status}`;
      }

      return {
        id: String(r.id),
        type: 'autopay_attempt' as const,
        occurredAt: r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt ?? ''),
        description,
        amountCents,
        status,
      };
    });

    // 2. Fetch late fee assessments for this account
    const lateFeeRows = await (tx as any)
      .select({
        id: lateFeeAssessments.id,
        assessmentDate: lateFeeAssessments.assessmentDate,
        overdueAmountCents: lateFeeAssessments.overdueAmountCents,
        feeAmountCents: lateFeeAssessments.feeAmountCents,
        waived: lateFeeAssessments.waived,
      })
      .from(lateFeeAssessments)
      .where(
        and(
          eq(lateFeeAssessments.tenantId, input.tenantId),
          eq(lateFeeAssessments.membershipAccountId, input.membershipAccountId),
        ),
      )
      .orderBy(desc(lateFeeAssessments.assessmentDate))
      .limit(50);

    const lateFeeEntries: CollectionsTimelineEntry[] = (lateFeeRows as any[]).map((r) => {
      const feeCents = Number(r.feeAmountCents ?? 0);
      const overdueCents = Number(r.overdueAmountCents ?? 0);
      const waived = Boolean(r.waived);

      const description = waived
        ? `Late fee of $${(feeCents / 100).toFixed(2)} waived (overdue: $${(overdueCents / 100).toFixed(2)})`
        : `Late fee of $${(feeCents / 100).toFixed(2)} assessed on $${(overdueCents / 100).toFixed(2)} overdue`;

      return {
        id: String(r.id),
        type: 'late_fee' as const,
        occurredAt: r.assessmentDate instanceof Date
          ? r.assessmentDate.toISOString()
          : String(r.assessmentDate ?? ''),
        description,
        amountCents: feeCents,
        status: waived ? 'waived' : 'assessed',
      };
    });

    // 3. Fetch membership holds for this account (both active and lifted)
    const holdRows = await (tx as any)
      .select({
        id: membershipHolds.id,
        holdType: membershipHolds.holdType,
        reason: membershipHolds.reason,
        placedAt: membershipHolds.placedAt,
        liftedAt: membershipHolds.liftedAt,
        liftedReason: membershipHolds.liftedReason,
        isActive: membershipHolds.isActive,
      })
      .from(membershipHolds)
      .where(
        and(
          eq(membershipHolds.tenantId, input.tenantId),
          eq(membershipHolds.membershipAccountId, input.membershipAccountId),
        ),
      )
      .orderBy(desc(membershipHolds.placedAt))
      .limit(50);

    const holdEntries: CollectionsTimelineEntry[] = [];

    for (const r of holdRows as any[]) {
      const holdType = String(r.holdType);
      const reason = String(r.reason);

      // Add "hold placed" entry
      holdEntries.push({
        id: `${r.id}-placed`,
        type: 'hold_placed' as const,
        occurredAt: r.placedAt instanceof Date
          ? r.placedAt.toISOString()
          : String(r.placedAt ?? ''),
        description: `${holdType} hold placed: ${reason}`,
        amountCents: null,
        status: 'active',
      });

      // If the hold was lifted, add a "hold lifted" entry
      if (r.liftedAt) {
        const liftedReason = r.liftedReason ? String(r.liftedReason) : 'no reason given';
        holdEntries.push({
          id: `${r.id}-lifted`,
          type: 'hold_lifted' as const,
          occurredAt: r.liftedAt instanceof Date
            ? r.liftedAt.toISOString()
            : String(r.liftedAt ?? ''),
          description: `${holdType} hold lifted: ${liftedReason}`,
          amountCents: null,
          status: 'lifted',
        });
      }
    }

    // 4. Merge all entries and sort by occurredAt descending
    const allEntries = [
      ...attemptEntries,
      ...lateFeeEntries,
      ...holdEntries,
    ].sort((a, b) => {
      // Sort descending by occurredAt
      if (a.occurredAt > b.occurredAt) return -1;
      if (a.occurredAt < b.occurredAt) return 1;
      return 0;
    });

    return allEntries;
  });
}
