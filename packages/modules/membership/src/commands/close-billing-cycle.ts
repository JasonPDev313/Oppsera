import { eq, and, lte } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipSubscriptions, membershipPlans } from '@oppsera/db';
import type { CloseBillingCycleInput } from '../validation';
import { advanceByFrequency } from '../helpers/proration';

interface BillingCycleResult {
  processedCount: number;
  totalBilledCents: number;
  errors: Array<{ subscriptionId: string; error: string }>;
}

export async function closeBillingCycle(
  ctx: RequestContext,
  input: CloseBillingCycleInput,
): Promise<BillingCycleResult> {
  const summary: BillingCycleResult = {
    processedCount: 0,
    totalBilledCents: 0,
    errors: [],
  };

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Query all active subscriptions with nextBillDate <= cycleDate for this tenant
    const subscriptions = await (tx as any)
      .select({
        id: membershipSubscriptions.id,
        membershipAccountId: membershipSubscriptions.membershipAccountId,
        planId: membershipSubscriptions.planId,
        nextBillDate: membershipSubscriptions.nextBillDate,
        billedThroughDate: membershipSubscriptions.billedThroughDate,
      })
      .from(membershipSubscriptions)
      .where(
        and(
          eq(membershipSubscriptions.tenantId, ctx.tenantId),
          eq(membershipSubscriptions.status, 'active'),
          lte(membershipSubscriptions.nextBillDate, input.cycleDate),
        ),
      );

    const events = [];
    const now = new Date();

    for (const sub of subscriptions) {
      try {
        // Look up the plan to get the dues amount and frequency
        const [plan] = await (tx as any)
          .select({
            id: membershipPlans.id,
            duesAmountCents: membershipPlans.duesAmountCents,
            priceCents: membershipPlans.priceCents,
            billingFrequency: membershipPlans.billingFrequency,
          })
          .from(membershipPlans)
          .where(
            and(
              eq(membershipPlans.tenantId, ctx.tenantId),
              eq(membershipPlans.id, sub.planId),
            ),
          )
          .limit(1);

        if (!plan) {
          summary.errors.push({
            subscriptionId: sub.id,
            error: `Plan ${sub.planId} not found`,
          });
          continue;
        }

        const chargeAmountCents = plan.duesAmountCents ?? plan.priceCents;
        const frequency = plan.billingFrequency ?? 'monthly';
        const newNextBillDate = advanceByFrequency(sub.nextBillDate, frequency);

        // Update subscription: advance billing dates
        await (tx as any)
          .update(membershipSubscriptions)
          .set({
            lastBilledDate: sub.nextBillDate,
            billedThroughDate: sub.nextBillDate,
            nextBillDate: newNextBillDate,
            updatedAt: now,
          })
          .where(
            and(
              eq(membershipSubscriptions.tenantId, ctx.tenantId),
              eq(membershipSubscriptions.id, sub.id),
            ),
          );

        summary.processedCount += 1;
        summary.totalBilledCents += chargeAmountCents;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        summary.errors.push({
          subscriptionId: sub.id,
          error: message,
        });
      }
    }

    const event = buildEventFromContext(ctx, 'membership.billing_cycle.closed.v1', {
      cycleDate: input.cycleDate,
      processedCount: summary.processedCount,
      totalBilledCents: summary.totalBilledCents,
      errorCount: summary.errors.length,
    });
    events.push(event);

    return { result: summary, events };
  });

  await auditLog(ctx, 'membership.billing_cycle.closed', 'membership', input.cycleDate);
  return result;
}
