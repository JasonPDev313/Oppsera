import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { customerHouseholdMembers } from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { RemoveHouseholdMemberInput } from '../validation';

export async function removeHouseholdMember(ctx: RequestContext, input: RemoveHouseholdMemberInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find active membership
    const [membership] = await (tx as any).select().from(customerHouseholdMembers)
      .where(and(
        eq(customerHouseholdMembers.tenantId, ctx.tenantId),
        eq(customerHouseholdMembers.householdId, input.householdId),
        eq(customerHouseholdMembers.customerId, input.customerId),
        isNull(customerHouseholdMembers.leftAt),
      ))
      .limit(1);
    if (!membership) throw new NotFoundError('Household membership', `${input.householdId}/${input.customerId}`);

    // Soft-remove: set leftAt
    const [updated] = await (tx as any).update(customerHouseholdMembers).set({
      leftAt: new Date(),
    }).where(eq(customerHouseholdMembers.id, membership.id)).returning();

    const event = buildEventFromContext(ctx, 'customer_household_member.removed.v1', {
      householdId: input.householdId,
      customerId: input.customerId,
      membershipId: membership.id,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.household_member_removed', 'customer', input.customerId);
  return result;
}
