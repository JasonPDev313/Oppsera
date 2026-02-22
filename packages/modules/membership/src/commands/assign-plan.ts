import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, membershipSubscriptions, membershipPlans } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { AssignPlanInput } from '../validation';
import { computeProration, advanceByFrequency, computePeriodEnd } from '../helpers/proration';
import type { ProrationPolicy } from '../helpers/proration';

export async function assignPlan(
  ctx: RequestContext,
  input: AssignPlanInput,
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

    // Validate plan exists for tenant
    const [plan] = await (tx as any)
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
          eq(membershipPlans.id, input.planId),
        ),
      )
      .limit(1);

    if (!plan) {
      throw new NotFoundError('MembershipPlan', input.planId);
    }

    const frequency = plan.billingFrequency ?? 'monthly';
    const nextBillDate = advanceByFrequency(effectiveDate, frequency);

    // Compute prorated amount if requested
    let proratedAmountCents: number | null = null;
    if (input.prorationEnabled) {
      const chargeAmount = plan.duesAmountCents ?? plan.priceCents;
      const policy = (plan.prorationPolicy ?? 'daily') as ProrationPolicy;
      const periodEnd = computePeriodEnd(effectiveDate, frequency);
      proratedAmountCents = computeProration(
        chargeAmount,
        policy,
        effectiveDate,
        periodEnd,
        effectiveDate,
      );
    }

    const id = generateUlid();
    const now = new Date();

    const [subscription] = await (tx as any)
      .insert(membershipSubscriptions)
      .values({
        id,
        tenantId: ctx.tenantId,
        membershipAccountId: input.membershipAccountId,
        planId: input.planId,
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

    const event = buildEventFromContext(ctx, 'membership.plan.assigned.v1', {
      subscriptionId: id,
      membershipAccountId: input.membershipAccountId,
      planId: input.planId,
      effectiveDate,
      nextBillDate,
      proratedAmountCents,
    });

    return { result: { ...subscription!, proratedAmountCents }, events: [event] };
  });

  await auditLog(ctx, 'membership.plan.assigned', 'membership_subscription', result.id);
  return result;
}
