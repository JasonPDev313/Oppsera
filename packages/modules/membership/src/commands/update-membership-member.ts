import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipMembers } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { UpdateMembershipMemberInput } from '../validation';

export async function updateMembershipMember(
  ctx: RequestContext,
  input: UpdateMembershipMemberInput,
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

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };

    if (input.role !== undefined) updateValues.role = input.role;
    if (input.status !== undefined) updateValues.status = input.status;
    if (input.chargePrivileges !== undefined) updateValues.chargePrivileges = input.chargePrivileges;
    if (input.memberNumber !== undefined) updateValues.memberNumber = input.memberNumber;

    const [updated] = await (tx as any)
      .update(membershipMembers)
      .set(updateValues)
      .where(
        and(
          eq(membershipMembers.tenantId, ctx.tenantId),
          eq(membershipMembers.id, input.memberId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'membership.member.updated.v1', {
      memberId: input.memberId,
      membershipAccountId: existing.membershipAccountId,
      updatedFields: Object.keys(updateValues).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'membership.member.updated', 'membership_member', result.id);
  return result;
}
