import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
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
  // GL data stored outside the transaction to avoid nesting publishWithOutbox.
  // Populated inside the tx callback, read after commit.
  interface GlPostData {
    toRecognizeDollars: string;
    sourceRef: string;
    scheduleId: string;
    throughDate: string;
    billingPeriodStart: string;
    deferredRevenueGlAccountId: string;
    revenueGlAccountId: string;
    locationId?: string;
    customerId?: string;
  }
  let glData: GlPostData | null = null;

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

    // 5. Insert recognition entry (audit trail) — GL posted AFTER transaction
    //    to avoid nested publishWithOutbox deadlock (postEntry calls publishWithOutbox
    //    internally, and nesting two publishWithOutbox calls exhausts max:2 pool).
    const sourceRef = `recognition-${input.scheduleId}-${input.throughDate}`;
    await tx.insert(membershipDuesRecognitionEntries).values({
      id: generateUlid(),
      tenantId: ctx.tenantId,
      scheduleId: input.scheduleId,
      recognitionDate: input.throughDate,
      recognizedCents: toRecognize,
      cumulativeRecognizedCents: newCumulative,
      glJournalEntryId: null, // Updated after GL post
    });

    // 6. Update schedule
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

    // Store GL data in outer variable for post-commit posting
    glData = {
      toRecognizeDollars,
      sourceRef,
      scheduleId: input.scheduleId,
      throughDate: input.throughDate,
      billingPeriodStart: schedule.billingPeriodStart,
      deferredRevenueGlAccountId: schedule.deferredRevenueGlAccountId,
      revenueGlAccountId: schedule.revenueGlAccountId,
      locationId: schedule.locationId ?? undefined,
      customerId: schedule.customerId ?? undefined,
    };

    return {
      result: { recognizedCents: toRecognize, skipped: false },
      events: [],
    };
  });

  // Post GL entry AFTER the outer transaction commits to avoid nested
  // publishWithOutbox deadlock. postEntry opens its own transaction.
  // TS can't track mutation inside async callbacks, so re-assert the type
  const resolvedGlData = glData as GlPostData | null;
  if (resolvedGlData) {
    try {
      const postingApi = getAccountingPostingApi();
      const journalResult = await postingApi.postEntry(ctx, {
        businessDate: resolvedGlData.throughDate,
        sourceModule: 'membership',
        sourceReferenceId: resolvedGlData.sourceRef,
        memo: `Membership revenue recognition: ${resolvedGlData.billingPeriodStart} through ${resolvedGlData.throughDate}`,
        currency: 'USD',
        lines: [
          {
            accountId: resolvedGlData.deferredRevenueGlAccountId,
            debitAmount: resolvedGlData.toRecognizeDollars,
            creditAmount: '0',
            locationId: resolvedGlData.locationId,
            memo: 'Deferred revenue release — membership dues',
          },
          {
            accountId: resolvedGlData.revenueGlAccountId,
            debitAmount: '0',
            creditAmount: resolvedGlData.toRecognizeDollars,
            locationId: resolvedGlData.locationId,
            customerId: resolvedGlData.customerId,
            memo: 'Earned membership dues revenue',
          },
        ],
        forcePost: true,
      });

      // Back-fill the GL journal entry ID on the recognition entry
      const { db } = await import('@oppsera/db');
      await db
        .update(membershipDuesRecognitionEntries)
        .set({ glJournalEntryId: journalResult.id })
        .where(
          and(
            eq(membershipDuesRecognitionEntries.tenantId, ctx.tenantId),
            eq(membershipDuesRecognitionEntries.scheduleId, resolvedGlData.scheduleId),
            eq(membershipDuesRecognitionEntries.recognitionDate, resolvedGlData.throughDate),
          ),
        );
    } catch (glErr) {
      // GL adapter must never block the business operation (gotcha #9).
      // The recognition is already committed. Log for reconciliation.
      console.error('[recognizeMembershipRevenue] GL posting failed (recognition committed):', glErr);
    }
  }

  auditLogDeferred(
    ctx,
    'membership.dues.revenue_recognized',
    'membership_dues_recognition_schedule',
    input.scheduleId,
  );

  return result;
}
