import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, membershipSubscriptions, membershipPlans } from '@oppsera/db';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';
import type { ChangePlanInput } from '../validation';
import { computeProration, advanceByFrequency, computePeriodEnd } from '../helpers/proration';
import type { ProrationPolicy } from '../helpers/proration';

export async function changePlan(
  ctx: RequestContext,
  input: ChangePlanInput,
) {
  const today = new Date().toISOString().split('T')[0]!;
  const effectiveDate = input.effectiveDate ?? today;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate account exists for tenant
    const [account] = await (tx as any)
      .select({ id: membershipAccounts.id })
      .from(membershipAccounts)
      .where(
        and(
          eq(membershipAccounts.tenantId, ctx.tenantId),
          eq(membershipAccounts.id, input.membershipAccountId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new NotFoundError('MembershipAccount', input.membershipAccountId);
    }

    // Find existing active subscription for this account
    const [existingSub] = await (tx as any)
      .select()
      .from(membershipSubscriptions)
      .where(
        and(
          eq(membershipSubscriptions.tenantId, ctx.tenantId),
          eq(membershipSubscriptions.membershipAccountId, input.membershipAccountId),
          eq(membershipSubscriptions.status, 'active'),
        ),
      )
      .limit(1);

    if (!existingSub) {
      throw new AppError(
        'NO_ACTIVE_SUBSCRIPTION',
        'No active subscription found for this membership account',
        404,
      );
    }

    const oldPlanId = existingSub.planId;

    // Validate new plan exists for tenant
    const [newPlan] = await (tx as any)
      .select({
        id: membershipPlans.id,
        duesAmountCents: membershipPlans.duesAmountCents,
        priceCents: membershipPlans.priceCents,
        billingFrequency: membershipPlans.billingFrequency,
        prorationPolicy: membershipPlans.prorationPolicy,
      })
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.tenantId, ctx.tenantId),
          eq(membershipPlans.id, input.newPlanId),
        ),
      )
      .limit(1);

    if (!newPlan) {
      throw new NotFoundError('MembershipPlan', input.newPlanId);
    }

    // Cancel old subscription
    const now = new Date();
    await (tx as any)
      .update(membershipSubscriptions)
      .set({
        status: 'canceled',
        effectiveEnd: effectiveDate,
        updatedAt: now,
      })
      .where(
        and(
          eq(membershipSubscriptions.tenantId, ctx.tenantId),
          eq(membershipSubscriptions.id, existingSub.id),
        ),
      );

    // Create new subscription with the new plan
    const frequency = newPlan.billingFrequency ?? 'monthly';
    const nextBillDate = advanceByFrequency(effectiveDate, frequency);

    let proratedAmountCents: number | null = null;
    if (input.prorationEnabled) {
      const chargeAmount = newPlan.duesAmountCents ?? newPlan.priceCents;
      const policy = (newPlan.prorationPolicy ?? 'daily') as ProrationPolicy;
      const periodEnd = computePeriodEnd(effectiveDate, frequency);
      proratedAmountCents = computeProration(
        chargeAmount,
        policy,
        effectiveDate,
        periodEnd,
        effectiveDate,
      );
    }

    const newSubId = generateUlid();

    const [newSubscription] = await (tx as any)
      .insert(membershipSubscriptions)
      .values({
        id: newSubId,
        tenantId: ctx.tenantId,
        membershipAccountId: input.membershipAccountId,
        planId: input.newPlanId,
        status: 'active',
        effectiveStart: effectiveDate,
        effectiveEnd: null,
        nextBillDate,
        lastBilledDate: null,
        billedThroughDate: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.plan.changed.v1', {
      membershipAccountId: input.membershipAccountId,
      oldPlanId,
      newPlanId: input.newPlanId,
      oldSubscriptionId: existingSub.id,
      newSubscriptionId: newSubId,
      effectiveDate,
      proratedAmountCents,
    });

    return { result: { ...newSubscription!, proratedAmountCents, canceledSubscriptionId: existingSub.id }, events: [event] };
  });

  await auditLog(ctx, 'membership.plan.changed', 'membership_subscription', result.id);
  return result;
}
