import { eq, and, lte } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipSubscriptions, membershipPlans, membershipAccounts } from '@oppsera/db';
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
        // Look up the plan to get the dues amount, frequency, and GL accounts
        const [plan] = await (tx as any)
          .select({
            id: membershipPlans.id,
            duesAmountCents: membershipPlans.duesAmountCents,
            priceCents: membershipPlans.priceCents,
            billingFrequency: membershipPlans.billingFrequency,
            revenueGlAccountId: membershipPlans.revenueGlAccountId,
            deferredRevenueGlAccountId: membershipPlans.deferredRevenueGlAccountId,
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

        // Look up the membership account for customer and billing context
        const [account] = await (tx as any)
          .select({
            id: membershipAccounts.id,
            customerId: membershipAccounts.customerId,
            billingAccountId: membershipAccounts.billingAccountId,
          })
          .from(membershipAccounts)
          .where(
            and(
              eq(membershipAccounts.tenantId, ctx.tenantId),
              eq(membershipAccounts.id, sub.membershipAccountId),
            ),
          )
          .limit(1);

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

        // Emit per-subscription charge event for reporting + GL consumers
        const chargeEvent = buildEventFromContext(ctx, 'membership.billing.charged.v1', {
          membershipId: sub.id,
          membershipPlanId: plan.id,
          customerId: account?.customerId ?? null,
          billingAccountId: account?.billingAccountId ?? null,
          amountCents: chargeAmountCents,
          locationId: ctx.locationId,
          businessDate: input.cycleDate,
          billingPeriodStart: sub.nextBillDate,
          billingPeriodEnd: newNextBillDate,
          revenueGlAccountId: plan.revenueGlAccountId ?? null,
          deferredRevenueGlAccountId: plan.deferredRevenueGlAccountId ?? null,
        });
        events.push(chargeEvent);

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
