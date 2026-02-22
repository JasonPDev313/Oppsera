import { eq, and, lte, isNull, or } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { autopayProfiles, autopayRuns, autopayAttempts } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { RunAutopayBatchInput } from '../validation';

export async function runAutopayBatch(
  ctx: RequestContext,
  input: RunAutopayBatchInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const now = new Date();
    const runId = generateUlid();

    // Create the autopay run record
    const [run] = await (tx as any)
      .insert(autopayRuns)
      .values({
        id: runId,
        tenantId: ctx.tenantId,
        runDate: input.runDate,
        status: 'pending',
        totalProfilesCount: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalCollectedCents: 0,
        startedAt: now,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Find all active autopay profiles where nextRunAt <= now (or null = never run)
    const profiles = await (tx as any)
      .select({
        id: autopayProfiles.id,
        membershipAccountId: autopayProfiles.membershipAccountId,
        paymentMethodId: autopayProfiles.paymentMethodId,
        strategy: autopayProfiles.strategy,
        fixedAmountCents: autopayProfiles.fixedAmountCents,
      })
      .from(autopayProfiles)
      .where(
        and(
          eq(autopayProfiles.tenantId, ctx.tenantId),
          eq(autopayProfiles.isActive, true),
          or(
            isNull(autopayProfiles.nextRunAt),
            lte(autopayProfiles.nextRunAt, now),
          ),
        ),
      );

    // Create a pending attempt for each eligible profile
    const attempts: Array<Record<string, unknown>> = [];
    for (const profile of profiles) {
      const attemptId = generateUlid();

      // In V1, amountCents is determined by strategy. For simplicity, use fixedAmountCents or 0.
      // Actual amount resolution would happen in a background job processor.
      const amountCents = profile.strategy === 'fixed_amount'
        ? (profile.fixedAmountCents ?? 0)
        : 0; // 0 means "to be determined by processor"

      const [attempt] = await (tx as any)
        .insert(autopayAttempts)
        .values({
          id: attemptId,
          tenantId: ctx.tenantId,
          runId,
          membershipAccountId: profile.membershipAccountId,
          paymentMethodId: profile.paymentMethodId,
          amountCents,
          status: 'pending',
          failureReason: null,
          attemptNumber: 1,
          arTransactionId: null,
          nextRetryAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      attempts.push(attempt!);
    }

    // Update run with total count
    const totalProfilesCount = profiles.length;
    await (tx as any)
      .update(autopayRuns)
      .set({
        totalProfilesCount,
        status: totalProfilesCount > 0 ? 'in_progress' : 'completed',
        completedAt: totalProfilesCount === 0 ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(autopayRuns.tenantId, ctx.tenantId),
          eq(autopayRuns.id, runId),
        ),
      );

    const event = buildEventFromContext(ctx, 'membership.autopay.batch.started.v1', {
      runId,
      runDate: input.runDate,
      totalProfilesCount,
      attemptIds: attempts.map((a) => (a as any).id),
    });

    return {
      result: {
        ...run!,
        totalProfilesCount,
        attemptCount: attempts.length,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'membership.autopay.batch.started', 'autopay_run', result.id);
  return result;
}
