import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, membershipAuthorizedUsers } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { AddAuthorizedUserInput } from '../validation';

export async function addAuthorizedUser(
  ctx: RequestContext,
  input: AddAuthorizedUserInput,
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

    const [authorizedUser] = await (tx as any)
      .insert(membershipAuthorizedUsers)
      .values({
        id,
        tenantId: ctx.tenantId,
        membershipAccountId: input.membershipAccountId,
        name: input.name,
        relationship: input.relationship ?? null,
        privilegesJson: input.privilegesJson ?? null,
        effectiveDate: input.effectiveDate ?? null,
        expirationDate: input.expirationDate ?? null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.authorized_user.added.v1', {
      authorizedUserId: id,
      membershipAccountId: input.membershipAccountId,
      name: input.name,
    });

    return { result: authorizedUser!, events: [event] };
  });

  await auditLog(ctx, 'membership.authorized_user.added', 'membership_authorized_user', result.id);
  return result;
}
