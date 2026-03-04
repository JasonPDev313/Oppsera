import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  membershipDuesRecognitionSchedule,
  membershipDuesRecognitionEntries,
} from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

export interface RecognizeMembershipRevenueInput {
  scheduleId: string;
  throughDate: string; // ISO YYYY-MM-DD
}

/**
 * Recognize membership dues revenue for one schedule row through `throughDate`.
 *
 * Period math (exclusive end):
 *   totalDays     = billingPeriodEnd - billingPeriodStart
 *   daysEarned    = min(throughDate + 1, billingPeriodEnd) - billingPeriodStart
 *   earnedCents   = round(daysEarned / totalDays * totalAmountCents)
 *   incrementCents = earnedCents - recognizedAmountCents
 *
 * GL: Dr Deferred Revenue / Cr Revenue
 * sourceReferenceId: 'recognition-{scheduleId}-{throughDate}'
 */
export async function recognizeMembershipRevenue(
  ctx: RequestContext,
  input: RecognizeMembershipRevenueInput,
): Promise<{ recognizedCents: number; skipped: boolean }> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load schedule
    const [schedule] = await tx
      .select()
      .from(membershipDuesRecognitionSchedule)
      .where(
        and(
          eq(membershipDuesRecognitionSchedule.id, input.scheduleId),
          eq(membershipDuesRecognitionSchedule.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!schedule) {
      throw new Error(`Recognition schedule ${input.scheduleId} not found`);
    }

    if (schedule.status === 'fully_recognized') {
      return { result: { recognizedCents: 0, skipped: true }, events: [] };
    }

    // 2. Idempotency — already recognized for this date?
    const [existing] = await tx
      .select({ id: membershipDuesRecognitionEntries.id })
      .from(membershipDuesRecognitionEntries)
      .where(
        and(
          eq(membershipDuesRecognitionEntries.tenantId, ctx.tenantId),
          eq(membershipDuesRecognitionEntries.scheduleId, input.scheduleId),
          eq(membershipDuesRecognitionEntries.recognitionDate, input.throughDate),
        ),
      )
      .limit(1);

    if (existing) {
      return { result: { recognizedCents: 0, skipped: true }, events: [] };
    }

    // 3. Straight-line period math
    const periodStart = new Date(schedule.billingPeriodStart + 'T00:00:00Z');
    const periodEnd = new Date(schedule.billingPeriodEnd + 'T00:00:00Z');
    const throughDate = new Date(input.throughDate + 'T00:00:00Z');

    const msPerDay = 1000 * 60 * 60 * 24;
    const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / msPerDay);

    if (totalDays <= 0) {
      throw new Error(
        `Invalid billing period: start=${schedule.billingPeriodStart} end=${schedule.billingPeriodEnd}`,
      );
    }

    // throughDate is inclusive — add 1 day to get exclusive boundary, then clamp to periodEnd
    const throughExclusive = new Date(throughDate.getTime() + msPerDay);
    const effectiveBoundary = throughExclusive < periodEnd ? throughExclusive : periodEnd;
    const daysEarned = Math.round((effectiveBoundary.getTime() - periodStart.getTime()) / msPerDay);

    if (daysEarned <= 0) {
      return { result: { recognizedCents: 0, skipped: true }, events: [] };
    }

    // Earned cumulative through this date
    const earnedCents = Math.round((daysEarned / totalDays) * schedule.totalAmountCents);
    const alreadyRecognized = schedule.recognizedAmountCents;
    const incrementalCents = earnedCents - alreadyRecognized;

    if (incrementalCents <= 0) {
      return { result: { recognizedCents: 0, skipped: true }, events: [] };
    }

    // Cap at remaining to prevent rounding overshoot on final day
    const remaining = schedule.totalAmountCents - alreadyRecognized;
    const toRecognize = Math.min(incrementalCents, remaining);
    const newCumulative = alreadyRecognized + toRecognize;

    // 4. Convert cents → dollars for GL
    const toRecognizeDollars = (toRecognize / 100).toFixed(2);

    // 5. Post GL: Dr Deferred Revenue / Cr Revenue
    const postingApi = getAccountingPostingApi();
    const sourceRef = `recognition-${input.scheduleId}-${input.throughDate}`;
    const journalResult = await postingApi.postEntry(ctx, {
      businessDate: input.throughDate,
      sourceModule: 'membership',
      sourceReferenceId: sourceRef,
      memo: `Membership revenue recognition: ${schedule.billingPeriodStart} through ${input.throughDate}`,
      currency: 'USD',
      lines: [
        {
          accountId: schedule.deferredRevenueGlAccountId,
          debitAmount: toRecognizeDollars,
          creditAmount: '0',
          locationId: schedule.locationId ?? undefined,
          memo: 'Deferred revenue release — membership dues',
        },
        {
          accountId: schedule.revenueGlAccountId,
          debitAmount: '0',
          creditAmount: toRecognizeDollars,
          locationId: schedule.locationId ?? undefined,
          customerId: schedule.customerId ?? undefined,
          memo: 'Earned membership dues revenue',
        },
      ],
      forcePost: true,
    });

    // 6. Insert recognition entry (audit trail)
    await tx.insert(membershipDuesRecognitionEntries).values({
      id: generateUlid(),
      tenantId: ctx.tenantId,
      scheduleId: input.scheduleId,
      recognitionDate: input.throughDate,
      recognizedCents: toRecognize,
      cumulativeRecognizedCents: newCumulative,
      glJournalEntryId: journalResult.id,
    });

    // 7. Update schedule
    const isFullyRecognized = newCumulative >= schedule.totalAmountCents;
    await tx
      .update(membershipDuesRecognitionSchedule)
      .set({
        recognizedAmountCents: newCumulative,
        lastRecognizedDate: input.throughDate,
        status: isFullyRecognized ? 'fully_recognized' : 'active',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(membershipDuesRecognitionSchedule.id, input.scheduleId),
          eq(membershipDuesRecognitionSchedule.tenantId, ctx.tenantId),
        ),
      );

    return { result: { recognizedCents: toRecognize, skipped: false }, events: [] };
  });

  await auditLog(
    ctx,
    'membership.dues.revenue_recognized',
    'membership_dues_recognition_schedule',
    input.scheduleId,
  );

  return result;
}
