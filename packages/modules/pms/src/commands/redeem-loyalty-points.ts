import { eq, sql, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
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
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'redeemLoyaltyPoints');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Lock the member row to prevent concurrent balance races (FOR UPDATE)
    const memberRows = await tx.execute(
      sql`SELECT * FROM pms_loyalty_members WHERE id = ${input.memberId} AND tenant_id = ${ctx.tenantId} LIMIT 1 FOR UPDATE`,
    );
    const member = Array.from(memberRows as Iterable<Record<string, unknown>>)[0];

    if (!member) throw new NotFoundError('Loyalty member', input.memberId);

    const pointsBalance = Number(member.points_balance);
    if (pointsBalance < input.points) {
      throw new AppError('INSUFFICIENT_POINTS', `Only ${pointsBalance} points available`, 400);
    }

    // Get redemption value from program
    const [program] = await tx
      .select()
      .from(pmsLoyaltyPrograms)
      .where(eq(pmsLoyaltyPrograms.id, String(member.program_id)))
      .limit(1);

    const redemptionValueCents = program ? Number(program.redemptionValueCents ?? 1) : 1;
    const creditCents = input.points * redemptionValueCents;

    const newBalance = pointsBalance - input.points;

    await tx
      .update(pmsLoyaltyMembers)
      .set({ pointsBalance: newBalance })
      .where(and(eq(pmsLoyaltyMembers.id, input.memberId), eq(pmsLoyaltyMembers.tenantId, ctx.tenantId)));

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

    const resultPayload = {
      transactionId: transaction!.id,
      pointsRedeemed: input.points,
      creditCents,
      balanceAfter: newBalance,
    };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'redeemLoyaltyPoints', resultPayload);
    return { result: resultPayload, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.loyalty.points_redeemed', 'pms_loyalty_transaction', result.transactionId);
  return result;
}
