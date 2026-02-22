import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipPlans } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { UpdateMembershipPlanV2Input } from '../validation';

export async function updateMembershipPlanV2(
  ctx: RequestContext,
  input: UpdateMembershipPlanV2Input,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any)
      .select({ id: membershipPlans.id })
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.tenantId, ctx.tenantId),
          eq(membershipPlans.id, input.planId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('MembershipPlan', input.planId);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.priceCents !== undefined) updates.priceCents = input.priceCents;
    if (input.duesAmountCents !== undefined) updates.duesAmountCents = input.duesAmountCents;
    if (input.billingFrequency !== undefined) {
      updates.billingFrequency = input.billingFrequency;
      updates.billingInterval = input.billingFrequency;
    }
    if (input.prorationPolicy !== undefined) updates.prorationPolicy = input.prorationPolicy;
    if (input.minMonthsCommitment !== undefined) updates.minMonthsCommitment = input.minMonthsCommitment;
    if (input.glDuesRevenueAccountId !== undefined) updates.glDuesRevenueAccountId = input.glDuesRevenueAccountId;
    if (input.taxable !== undefined) updates.taxable = input.taxable;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.privileges !== undefined) updates.privileges = input.privileges ?? [];
    if (input.rules !== undefined) updates.rules = input.rules;

    const [updated] = await (tx as any)
      .update(membershipPlans)
      .set(updates)
      .where(
        and(
          eq(membershipPlans.tenantId, ctx.tenantId),
          eq(membershipPlans.id, input.planId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'membership.plan.updated.v1', {
      planId: input.planId,
      updatedFields: Object.keys(updates).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'membership.plan.updated', 'membership_plan', result.id);
  return result;
}
