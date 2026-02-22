import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, membershipHolds } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { SetChargingHoldInput } from '../validation';

export async function setChargingHold(
  ctx: RequestContext,
  input: SetChargingHoldInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate membership account exists and belongs to tenant
    const [account] = await (tx as any)
      .select({ id: membershipAccounts.id, status: membershipAccounts.status })
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
    const holdType = input.holdType ?? 'charging';

    // Create the hold record
    const [hold] = await (tx as any)
      .insert(membershipHolds)
      .values({
        id,
        tenantId: ctx.tenantId,
        membershipAccountId: input.membershipAccountId,
        holdType,
        reason: input.reason,
        placedBy: ctx.user.id,
        placedAt: now,
        liftedBy: null,
        liftedAt: null,
        liftedReason: null,
        isActive: true,
        createdAt: now,
      })
      .returning();

    // Update the membership account holdCharging flag
    await (tx as any)
      .update(membershipAccounts)
      .set({ holdCharging: true, updatedAt: now })
      .where(
        and(
          eq(membershipAccounts.tenantId, ctx.tenantId),
          eq(membershipAccounts.id, input.membershipAccountId),
        ),
      );

    const event = buildEventFromContext(ctx, 'membership.hold.placed.v1', {
      holdId: id,
      membershipAccountId: input.membershipAccountId,
      holdType,
      reason: input.reason,
      placedBy: ctx.user.id,
    });

    return { result: hold!, events: [event] };
  });

  await auditLog(ctx, 'membership.hold.placed', 'membership_hold', result.id);
  return result;
}
