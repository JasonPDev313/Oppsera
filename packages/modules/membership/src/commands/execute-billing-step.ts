import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { billingCycleRuns } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { ExecuteBillingStepInput } from '../validation';

export async function executeBillingStep(
  ctx: RequestContext,
  input: ExecuteBillingStepInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate run exists and belongs to tenant
    const [run] = await (tx as any)
      .select({
        id: billingCycleRuns.id,
        status: billingCycleRuns.status,
        steps: billingCycleRuns.steps,
        exceptionsJson: billingCycleRuns.exceptionsJson,
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

    // Only preview or in_progress runs can accept steps
    if (run.status !== 'preview' && run.status !== 'in_progress') {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot execute step on run with status '${run.status}'; must be 'preview' or 'in_progress'`,
        409,
      );
    }

    const now = new Date();

    // Build the step execution record
    const stepRecord = {
      stepName: input.stepName,
      executedBy: ctx.user.id,
      executedAt: now.toISOString(),
      status: 'completed' as const,
    };

    // Append to steps array
    const existingSteps = Array.isArray(run.steps) ? (run.steps as Record<string, unknown>[]) : [];
    const updatedSteps = [...existingSteps, stepRecord];

    // Build the update payload
    const updatePayload: Record<string, unknown> = {
      steps: updatedSteps,
      updatedAt: now,
    };

    // Transition from preview to in_progress on first step execution
    if (run.status === 'preview') {
      updatePayload.status = 'in_progress';
      updatePayload.startedAt = now;
    }

    // For exception_review step, store exceptions in exceptionsJson
    if (input.stepName === 'exception_review' && input.exceptions) {
      updatePayload.exceptionsJson = input.exceptions;
    }

    await (tx as any)
      .update(billingCycleRuns)
      .set(updatePayload)
      .where(
        and(
          eq(billingCycleRuns.tenantId, ctx.tenantId),
          eq(billingCycleRuns.id, input.runId),
        ),
      );

    const event = buildEventFromContext(ctx, 'membership.billing_cycle.step.executed.v1', {
      runId: input.runId,
      stepName: input.stepName,
      executedBy: ctx.user.id,
      hasExceptions: Boolean(input.exceptions?.length),
    });

    return {
      result: {
        runId: input.runId,
        stepName: input.stepName,
        status: updatePayload.status ?? run.status,
        stepsCompleted: updatedSteps.length,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'membership.billing_cycle.step.executed', 'billing_cycle_run', result.runId);
  return result;
}
