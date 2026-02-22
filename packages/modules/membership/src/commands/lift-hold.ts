import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, membershipHolds } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { LiftHoldInput } from '../validation';

export async function liftHold(
  ctx: RequestContext,
  input: LiftHoldInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate the hold exists and belongs to tenant
    const [hold] = await (tx as any)
      .select({
        id: membershipHolds.id,
        membershipAccountId: membershipHolds.membershipAccountId,
        holdType: membershipHolds.holdType,
        isActive: membershipHolds.isActive,
      })
      .from(membershipHolds)
      .where(
        and(
          eq(membershipHolds.tenantId, ctx.tenantId),
          eq(membershipHolds.id, input.holdId),
        ),
      )
      .limit(1);

    if (!hold) {
      throw new NotFoundError('MembershipHold', input.holdId);
    }

    if (!hold.isActive) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Hold '${input.holdId}' is already inactive`,
        422,
      );
    }

    const now = new Date();

    // Lift the hold
    await (tx as any)
      .update(membershipHolds)
      .set({
        isActive: false,
        liftedBy: ctx.user.id,
        liftedAt: now,
        liftedReason: input.reason,
      })
      .where(
        and(
          eq(membershipHolds.tenantId, ctx.tenantId),
          eq(membershipHolds.id, input.holdId),
        ),
      );

    // Check if any other active holds remain for this membership account
    const remainingHolds = await (tx as any)
      .select({ id: membershipHolds.id })
      .from(membershipHolds)
      .where(
        and(
          eq(membershipHolds.tenantId, ctx.tenantId),
          eq(membershipHolds.membershipAccountId, hold.membershipAccountId),
          eq(membershipHolds.isActive, true),
        ),
      )
      .limit(1);

    // If no more active holds, clear the holdCharging flag on the account
    if (remainingHolds.length === 0) {
      await (tx as any)
        .update(membershipAccounts)
        .set({ holdCharging: false, updatedAt: now })
        .where(
          and(
            eq(membershipAccounts.tenantId, ctx.tenantId),
            eq(membershipAccounts.id, hold.membershipAccountId),
          ),
        );
    }

    const event = buildEventFromContext(ctx, 'membership.hold.lifted.v1', {
      holdId: input.holdId,
      membershipAccountId: hold.membershipAccountId,
      holdType: hold.holdType,
      liftedBy: ctx.user.id,
      reason: input.reason,
      accountHoldCleared: remainingHolds.length === 0,
    });

    return {
      result: {
        holdId: input.holdId,
        membershipAccountId: hold.membershipAccountId,
        status: 'lifted' as const,
        accountHoldCleared: remainingHolds.length === 0,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'membership.hold.lifted', 'membership_hold', result.holdId);
  return result;
}
