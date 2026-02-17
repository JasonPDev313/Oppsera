import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { computeChanges } from '@oppsera/core/audit/diff';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { membershipPlans } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateMembershipPlanInput } from '../validation';

export async function updateMembershipPlan(ctx: RequestContext, planId: string, input: UpdateMembershipPlanInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any).select().from(membershipPlans)
      .where(and(eq(membershipPlans.id, planId), eq(membershipPlans.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Membership plan', planId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.billingEnabled !== undefined) updates.billingEnabled = input.billingEnabled;
    if (input.privileges !== undefined) updates.privileges = input.privileges;
    if (input.rules !== undefined) updates.rules = input.rules;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const [updated] = await (tx as any).update(membershipPlans).set(updates)
      .where(eq(membershipPlans.id, planId)).returning();

    const changes = computeChanges(existing, updated!);
    const event = buildEventFromContext(ctx, 'membership_plan.updated.v1', { planId, changes });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'membership_plan.updated', 'membership_plan', planId);
  return result;
}
