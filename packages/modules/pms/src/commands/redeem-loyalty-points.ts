import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, AppError } from '@oppsera/shared';
import { pmsLoyaltyMembers, pmsLoyaltyTransactions, pmsLoyaltyPrograms } from '@oppsera/db';
import type { RedeemLoyaltyPointsInput } from '../validation';
import { PMS_EVENTS } from '../events/types';

export interface RedemptionResult {
  transactionId: string;
  pointsRedeemed: number;
  creditCents: number;
  balanceAfter: number;
}

export async function redeemLoyaltyPoints(
  ctx: RequestContext,
  input: RedeemLoyaltyPointsInput,
): Promise<RedemptionResult> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [member] = await tx
      .select()
      .from(pmsLoyaltyMembers)
      .where(
        and(
          eq(pmsLoyaltyMembers.id, input.memberId),
          eq(pmsLoyaltyMembers.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!member) throw new NotFoundError('Loyalty member', input.memberId);

    if (member.pointsBalance < input.points) {
      throw new AppError('INSUFFICIENT_POINTS', `Only ${member.pointsBalance} points available`, 400);
    }

    // Get redemption value from program
    const [program] = await tx
      .select()
      .from(pmsLoyaltyPrograms)
      .where(eq(pmsLoyaltyPrograms.id, member.programId))
      .limit(1);

    const redemptionValueCents = program?.redemptionValueCents ?? 1;
    const creditCents = input.points * redemptionValueCents;

    const newBalance = member.pointsBalance - input.points;

    await tx
      .update(pmsLoyaltyMembers)
      .set({ pointsBalance: newBalance })
      .where(eq(pmsLoyaltyMembers.id, input.memberId));

    const [transaction] = await tx
      .insert(pmsLoyaltyTransactions)
      .values({
        tenantId: ctx.tenantId,
        memberId: input.memberId,
        transactionType: 'redeem',
        points: -input.points,
        balanceAfter: newBalance,
        reservationId: input.reservationId ?? null,
        description: input.description ?? `Redeemed ${input.points} points`,
        createdBy: ctx.user?.id ?? null,
      })
      .returning();

    const event = buildEventFromContext(ctx, PMS_EVENTS.LOYALTY_POINTS_REDEEMED, {
      memberId: input.memberId,
      points: input.points,
      creditCents,
      balanceAfter: newBalance,
    });

    return {
      result: {
        transactionId: transaction!.id,
        pointsRedeemed: input.points,
        creditCents,
        balanceAfter: newBalance,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'pms.loyalty.points_redeemed', 'pms_loyalty_transaction', result.transactionId);
  return result;
}
