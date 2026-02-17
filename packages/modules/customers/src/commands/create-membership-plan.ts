import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipPlans } from '@oppsera/db';
import type { CreateMembershipPlanInput } from '../validation';

export async function createMembershipPlan(ctx: RequestContext, input: CreateMembershipPlanInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [created] = await (tx as any).insert(membershipPlans).values({
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? null,
      billingInterval: input.billingInterval ?? 'monthly',
      priceCents: input.priceCents,
      billingEnabled: input.billingEnabled ?? true,
      privileges: input.privileges ?? [],
      rules: input.rules ?? null,
    }).returning();

    const event = buildEventFromContext(ctx, 'membership_plan.created.v1', {
      planId: created!.id,
      name: created!.name,
      billingInterval: created!.billingInterval,
      priceCents: created!.priceCents,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'membership_plan.created', 'membership_plan', result.id);
  return result;
}
