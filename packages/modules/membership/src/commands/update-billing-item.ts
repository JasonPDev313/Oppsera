import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipBillingItems } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { UpdateBillingItemInput } from '../validation';

export async function updateBillingItem(
  ctx: RequestContext,
  input: UpdateBillingItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing billing item
    const [existing] = await (tx as any)
      .select()
      .from(membershipBillingItems)
      .where(
        and(
          eq(membershipBillingItems.tenantId, ctx.tenantId),
          eq(membershipBillingItems.id, input.billingItemId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('MembershipBillingItem', input.billingItemId);
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };

    if (input.description !== undefined) updateValues.description = input.description;
    if (input.amountCents !== undefined) updateValues.amountCents = input.amountCents;
    if (input.discountCents !== undefined) updateValues.discountCents = input.discountCents;
    if (input.frequency !== undefined) updateValues.frequency = input.frequency;
    if (input.taxRateId !== undefined) updateValues.taxRateId = input.taxRateId;
    if (input.glRevenueAccountId !== undefined) updateValues.glRevenueAccountId = input.glRevenueAccountId;
    if (input.glDeferredRevenueAccountId !== undefined) updateValues.glDeferredRevenueAccountId = input.glDeferredRevenueAccountId;
    if (input.prorationEnabled !== undefined) updateValues.prorationEnabled = input.prorationEnabled;
    if (input.seasonalJson !== undefined) updateValues.seasonalJson = input.seasonalJson;
    if (input.isSubMemberItem !== undefined) updateValues.isSubMemberItem = input.isSubMemberItem;
    if (input.isActive !== undefined) updateValues.isActive = input.isActive;

    const [updated] = await (tx as any)
      .update(membershipBillingItems)
      .set(updateValues)
      .where(
        and(
          eq(membershipBillingItems.tenantId, ctx.tenantId),
          eq(membershipBillingItems.id, input.billingItemId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'membership.billing_item.updated.v1', {
      billingItemId: input.billingItemId,
      membershipAccountId: existing.membershipAccountId,
      updatedFields: Object.keys(updateValues).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'membership.billing_item.updated', 'membership_billing_item', result.id);
  return result;
}
