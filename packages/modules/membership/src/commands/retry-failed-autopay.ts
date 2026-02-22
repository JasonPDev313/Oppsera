import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { autopayAttempts } from '@oppsera/db';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';
import type { RetryFailedAutopayInput } from '../validation';
import { computeRetrySchedule } from '../helpers/autopay-retry';

export async function retryFailedAutopay(
  ctx: RequestContext,
  input: RetryFailedAutopayInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate the attempt exists and belongs to tenant
    const [attempt] = await (tx as any)
      .select({
        id: autopayAttempts.id,
        runId: autopayAttempts.runId,
        membershipAccountId: autopayAttempts.membershipAccountId,
        paymentMethodId: autopayAttempts.paymentMethodId,
        amountCents: autopayAttempts.amountCents,
        status: autopayAttempts.status,
        attemptNumber: autopayAttempts.attemptNumber,
      })
      .from(autopayAttempts)
      .where(
        and(
          eq(autopayAttempts.tenantId, ctx.tenantId),
          eq(autopayAttempts.id, input.attemptId),
        ),
      )
      .limit(1);

    if (!attempt) {
      throw new NotFoundError('AutopayAttempt', input.attemptId);
    }

    if (attempt.status !== 'failed') {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot retry attempt with status '${attempt.status}'; only failed attempts can be retried`,
        422,
      );
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0]!;
    const schedule = computeRetrySchedule(attempt.attemptNumber, today);

    if (schedule.shouldRetry) {
      // Create a new attempt with incremented attempt number
      const newAttemptId = generateUlid();
      const [newAttempt] = await (tx as any)
        .insert(autopayAttempts)
        .values({
          id: newAttemptId,
          tenantId: ctx.tenantId,
          runId: attempt.runId,
          membershipAccountId: attempt.membershipAccountId,
          paymentMethodId: attempt.paymentMethodId,
          amountCents: attempt.amountCents,
          status: 'pending',
          failureReason: null,
          attemptNumber: attempt.attemptNumber + 1,
          arTransactionId: null,
          nextRetryAt: schedule.nextRetryAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const event = buildEventFromContext(ctx, 'membership.autopay.retry.scheduled.v1', {
        originalAttemptId: input.attemptId,
        newAttemptId,
        membershipAccountId: attempt.membershipAccountId,
        attemptNumber: attempt.attemptNumber + 1,
        nextRetryAt: schedule.nextRetryAt,
        dunningLevel: schedule.dunningLevel,
      });

      return { result: newAttempt!, events: [event] };
    } else {
      // Mark original attempt as permanently failed
      await (tx as any)
        .update(autopayAttempts)
        .set({
          status: 'permanently_failed',
          updatedAt: now,
        })
        .where(
          and(
            eq(autopayAttempts.tenantId, ctx.tenantId),
            eq(autopayAttempts.id, input.attemptId),
          ),
        );

      const event = buildEventFromContext(ctx, 'membership.autopay.attempt.failed_permanently.v1', {
        attemptId: input.attemptId,
        membershipAccountId: attempt.membershipAccountId,
        attemptNumber: attempt.attemptNumber,
        dunningLevel: schedule.dunningLevel,
      });

      return {
        result: {
          attemptId: input.attemptId,
          status: 'permanently_failed' as const,
          dunningLevel: schedule.dunningLevel,
        },
        events: [event],
      };
    }
  });

  await auditLog(ctx, 'membership.autopay.retry', 'autopay_attempt', result.id ?? result.attemptId);
  return result;
}
