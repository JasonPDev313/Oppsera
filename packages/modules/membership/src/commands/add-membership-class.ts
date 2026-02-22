import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, membershipClasses } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { AddMembershipClassInput } from '../validation';

export async function addMembershipClass(
  ctx: RequestContext,
  input: AddMembershipClassInput,
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

    const [membershipClass] = await (tx as any)
      .insert(membershipClasses)
      .values({
        id,
        tenantId: ctx.tenantId,
        membershipAccountId: input.membershipAccountId,
        className: input.className,
        effectiveDate: input.effectiveDate ?? null,
        expirationDate: input.expirationDate ?? null,
        billedThroughDate: null,
        isArchived: false,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'membership.class.added.v1', {
      classId: id,
      membershipAccountId: input.membershipAccountId,
      className: input.className,
    });

    return { result: membershipClass!, events: [event] };
  });

  await auditLog(ctx, 'membership.class.added', 'membership_class', result.id);
  return result;
}
