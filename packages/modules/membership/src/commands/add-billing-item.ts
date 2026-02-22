import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, membershipBillingItems } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { AddBillingItemInput } from '../validation';

export async function addBillingItem(
  ctx: RequestContext,
  input: AddBillingItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate account exists for this tenant
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

    const id = generateUlid();
    const now = new Date();

    const [billingItem] = await (tx as any)
      .insert(membershipBillingItems)
      .values({
        id,
        tenantId: ctx.tenantId,
        membershipAccountId: input.membershipAccountId,
        classId: input.classId ?? null,
        description: input.description,
        amountCents: input.amountCents,
        discountCents: input.discountCents ?? 0,
        frequency: input.frequency ?? 'monthly',
        taxRateId: input.taxRateId ?? null,
        glRevenueAccountId: input.glRevenueAccountId ?? null,
        glDeferredRevenueAccountId: input.glDeferredRevenueAccountId ?? null,
        prorationEnabled: input.prorationEnabled ?? false,
        seasonalJson: input.seasonalJson ?? null,
        isSubMemberItem: input.isSubMemberItem ?? false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.billing_item.added.v1', {
      billingItemId: id,
      membershipAccountId: input.membershipAccountId,
      description: input.description,
      amountCents: input.amountCents,
      frequency: input.frequency ?? 'monthly',
    });

    return { result: billingItem!, events: [event] };
  });

  await auditLog(ctx, 'membership.billing_item.added', 'membership_billing_item', result.id);
  return result;
}
