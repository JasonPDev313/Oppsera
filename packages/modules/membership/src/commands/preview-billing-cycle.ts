import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { billingCycleRuns, membershipSubscriptions } from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';
import type { PreviewBillingCycleInput } from '../validation';

export async function previewBillingCycle(
  ctx: RequestContext,
  input: PreviewBillingCycleInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check no active run exists
    const [existing] = await (tx as any)
      .select({ id: billingCycleRuns.id })
      .from(billingCycleRuns)
      .where(and(
        eq(billingCycleRuns.tenantId, ctx.tenantId),
        inArray(billingCycleRuns.status, ['preview', 'in_progress']),
      ))
      .limit(1);

    if (existing) {
      throw new AppError('VALIDATION_ERROR', 'An active billing cycle run already exists', 409);
    }

    // Count subscriptions due
    const dueSubscriptions = await (tx as any)
      .select({ id: membershipSubscriptions.id })
      .from(membershipSubscriptions)
      .where(and(
        eq(membershipSubscriptions.tenantId, ctx.tenantId),
        eq(membershipSubscriptions.status, 'active'),
      ));

    const previewSummary = {
      totalAccounts: (dueSubscriptions as any[]).length,
      duesPreview: { count: (dueSubscriptions as any[]).length },
      initiationPreview: { count: 0 },
      minimumsPreview: { count: 0 },
      generatedAt: new Date().toISOString(),
    };

    const runId = generateUlid();
    const now = new Date();

    const [run] = await (tx as any)
      .insert(billingCycleRuns)
      .values({
        id: runId,
        tenantId: ctx.tenantId,
        cycleDate: input.cycleDate,
        status: 'preview',
        steps: [],
        startedBy: ctx.user.id,
        previewSummary,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.billing_cycle.preview.created.v1', {
      runId,
      cycleDate: input.cycleDate,
      previewSummary,
    });

    return { result: run!, events: [event] };
  });

  await auditLog(ctx, 'membership.billing_cycle.preview.created', 'billing_cycle_run', result.id);
  return result;
}
