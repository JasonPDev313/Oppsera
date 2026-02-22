import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipMembers } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export async function removeMembershipMember(
  ctx: RequestContext,
  input: { memberId: string },
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing member
    const [existing] = await (tx as any)
      .select()
      .from(membershipMembers)
      .where(
        and(
          eq(membershipMembers.tenantId, ctx.tenantId),
          eq(membershipMembers.id, input.memberId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('MembershipMember', input.memberId);
    }

    // Soft-remove: set status to 'removed'
    const [updated] = await (tx as any)
      .update(membershipMembers)
      .set({
        status: 'removed',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(membershipMembers.tenantId, ctx.tenantId),
          eq(membershipMembers.id, input.memberId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'membership.member.removed.v1', {
      memberId: input.memberId,
      membershipAccountId: existing.membershipAccountId,
      customerId: existing.customerId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'membership.member.removed', 'membership_member', result.id);
  return result;
}
