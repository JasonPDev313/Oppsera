import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { FreezeMembershipInput } from '../validation';

export async function freezeMembership(
  ctx: RequestContext,
  input: FreezeMembershipInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate the membership account exists and belongs to tenant
    const [account] = await (tx as any)
      .select({
        id: membershipAccounts.id,
        status: membershipAccounts.status,
        accountNumber: membershipAccounts.accountNumber,
        primaryMemberId: membershipAccounts.primaryMemberId,
      })
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

    // Only active or suspended accounts can be frozen
    if (account.status !== 'active' && account.status !== 'suspended') {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot freeze account with status '${account.status}'; only active or suspended accounts can be frozen`,
        422,
      );
    }

    const now = new Date();
    const previousStatus = account.status;

    // Update the account status to frozen
    await (tx as any)
      .update(membershipAccounts)
      .set({
        status: 'frozen',
        updatedAt: now,
      })
      .where(
        and(
          eq(membershipAccounts.tenantId, ctx.tenantId),
          eq(membershipAccounts.id, input.membershipAccountId),
        ),
      );

    const event = buildEventFromContext(ctx, 'membership.account.frozen.v1', {
      membershipAccountId: input.membershipAccountId,
      accountNumber: account.accountNumber,
      previousStatus,
      reason: input.reason,
      frozenBy: ctx.user.id,
    });

    return {
      result: {
        membershipAccountId: input.membershipAccountId,
        status: 'frozen' as const,
        previousStatus,
        reason: input.reason,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'membership.account.frozen', 'membership_account', result.membershipAccountId);
  return result;
}
