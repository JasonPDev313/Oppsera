import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { billingCycleRuns } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { ReviewAndCloseCycleInput } from '../validation';

export async function reviewAndCloseCycle(
  ctx: RequestContext,
  input: ReviewAndCloseCycleInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate run exists and belongs to tenant
    const [run] = await (tx as any)
      .select({
        id: billingCycleRuns.id,
        status: billingCycleRuns.status,
        cycleDate: billingCycleRuns.cycleDate,
        totalDuesBilledCents: billingCycleRuns.totalDuesBilledCents,
        totalInitiationBilledCents: billingCycleRuns.totalInitiationBilledCents,
        totalMinimumsChargedCents: billingCycleRuns.totalMinimumsChargedCents,
        totalLateFeesCents: billingCycleRuns.totalLateFeesCents,
        totalStatementsGenerated: billingCycleRuns.totalStatementsGenerated,
        totalAutopayCollectedCents: billingCycleRuns.totalAutopayCollectedCents,
      })
      .from(billingCycleRuns)
      .where(
        and(
          eq(billingCycleRuns.tenantId, ctx.tenantId),
          eq(billingCycleRuns.id, input.runId),
        ),
      )
      .limit(1);

    if (!run) {
      throw new NotFoundError('BillingCycleRun', input.runId);
    }

    if (run.status !== 'in_progress') {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot close run with status '${run.status}'; must be 'in_progress'`,
        409,
      );
    }

    const now = new Date();

    await (tx as any)
      .update(billingCycleRuns)
      .set({
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(billingCycleRuns.tenantId, ctx.tenantId),
          eq(billingCycleRuns.id, input.runId),
        ),
      );

    const event = buildEventFromContext(ctx, 'membership.billing_cycle.completed.v1', {
      runId: input.runId,
      cycleDate: run.cycleDate instanceof Date
        ? run.cycleDate.toISOString().slice(0, 10)
        : String(run.cycleDate ?? ''),
      totalDuesBilledCents: Number(run.totalDuesBilledCents ?? 0),
      totalInitiationBilledCents: Number(run.totalInitiationBilledCents ?? 0),
      totalMinimumsChargedCents: Number(run.totalMinimumsChargedCents ?? 0),
      totalLateFeesCents: Number(run.totalLateFeesCents ?? 0),
      totalStatementsGenerated: Number(run.totalStatementsGenerated ?? 0),
      totalAutopayCollectedCents: Number(run.totalAutopayCollectedCents ?? 0),
      completedBy: ctx.user.id,
    });

    return {
      result: {
        runId: input.runId,
        status: 'completed' as const,
        completedAt: now.toISOString(),
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'membership.billing_cycle.completed', 'billing_cycle_run', result.runId);
  return result;
}
