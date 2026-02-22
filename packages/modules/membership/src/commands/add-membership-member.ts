import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, membershipMembers } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { AddMembershipMemberInput } from '../validation';

export async function addMembershipMember(
  ctx: RequestContext,
  input: AddMembershipMemberInput,
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

    const [member] = await (tx as any)
      .insert(membershipMembers)
      .values({
        id,
        tenantId: ctx.tenantId,
        membershipAccountId: input.membershipAccountId,
        customerId: input.customerId,
        role: input.role ?? 'member',
        chargePrivileges: input.chargePrivileges ?? true,
        memberNumber: input.memberNumber ?? null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.member.added.v1', {
      memberId: id,
      membershipAccountId: input.membershipAccountId,
      customerId: input.customerId,
      role: input.role ?? 'member',
    });

    return { result: member!, events: [event] };
  });

  await auditLog(ctx, 'membership.member.added', 'membership_member', result.id);
  return result;
}
