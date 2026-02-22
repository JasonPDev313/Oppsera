import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipPlans } from '@oppsera/db';
import { generateUlid, ConflictError } from '@oppsera/shared';
import type { CreateMembershipPlanV2Input } from '../validation';

export async function createMembershipPlanV2(
  ctx: RequestContext,
  input: CreateMembershipPlanV2Input,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check for duplicate plan name per tenant
    const [existing] = await (tx as any)
      .select({ id: membershipPlans.id })
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.tenantId, ctx.tenantId),
          eq(membershipPlans.name, input.name),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictError(
        `Membership plan '${input.name}' already exists for this tenant`,
      );
    }

    const id = generateUlid();
    const now = new Date();

    const [plan] = await (tx as any)
      .insert(membershipPlans)
      .values({
        id,
        tenantId: ctx.tenantId,
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents,
        duesAmountCents: input.duesAmountCents ?? null,
        billingFrequency: input.billingFrequency ?? 'monthly',
        prorationPolicy: input.prorationPolicy ?? 'daily',
        minMonthsCommitment: input.minMonthsCommitment ?? null,
        glDuesRevenueAccountId: input.glDuesRevenueAccountId ?? null,
        billingInterval: input.billingFrequency ?? 'monthly',
        billingEnabled: true,
        taxable: input.taxable ?? true,
        isActive: true,
        privileges: input.privileges ?? [],
        rules: input.rules ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.plan.created.v1', {
      planId: id,
      name: input.name,
      priceCents: input.priceCents,
      duesAmountCents: input.duesAmountCents ?? null,
      billingFrequency: input.billingFrequency ?? 'monthly',
      prorationPolicy: input.prorationPolicy ?? 'daily',
      taxable: input.taxable ?? true,
    });

    return { result: plan!, events: [event] };
  });

  await auditLog(ctx, 'membership.plan.created', 'membership_plan', result.id);
  return result;
}
