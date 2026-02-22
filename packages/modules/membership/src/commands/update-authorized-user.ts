import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAuthorizedUsers } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { UpdateAuthorizedUserInput } from '../validation';

export async function updateAuthorizedUser(
  ctx: RequestContext,
  input: UpdateAuthorizedUserInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing authorized user
    const [existing] = await (tx as any)
      .select()
      .from(membershipAuthorizedUsers)
      .where(
        and(
          eq(membershipAuthorizedUsers.tenantId, ctx.tenantId),
          eq(membershipAuthorizedUsers.id, input.authorizedUserId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('MembershipAuthorizedUser', input.authorizedUserId);
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name !== undefined) updateValues.name = input.name;
    if (input.relationship !== undefined) updateValues.relationship = input.relationship;
    if (input.privilegesJson !== undefined) updateValues.privilegesJson = input.privilegesJson;
    if (input.effectiveDate !== undefined) updateValues.effectiveDate = input.effectiveDate;
    if (input.expirationDate !== undefined) updateValues.expirationDate = input.expirationDate;
    if (input.status !== undefined) updateValues.status = input.status;

    const [updated] = await (tx as any)
      .update(membershipAuthorizedUsers)
      .set(updateValues)
      .where(
        and(
          eq(membershipAuthorizedUsers.tenantId, ctx.tenantId),
          eq(membershipAuthorizedUsers.id, input.authorizedUserId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'membership.authorized_user.updated.v1', {
      authorizedUserId: input.authorizedUserId,
      membershipAccountId: existing.membershipAccountId,
      updatedFields: Object.keys(updateValues).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'membership.authorized_user.updated', 'membership_authorized_user', result.id);
  return result;
}
