import { eq, sql, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { NotFoundError, AppError } from '@oppsera/shared';
import { pmsLoyaltyMembers, pmsLoyaltyTransactions } from '@oppsera/db';
import type { AdjustLoyaltyPointsInput } from '../validation';
import { PMS_EVENTS } from '../events/types';

export async function adjustLoyaltyPoints(
  ctx: RequestContext,
  input: AdjustLoyaltyPointsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'adjustLoyaltyPoints');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Lock the member row to prevent concurrent balance races (FOR UPDATE)
    const memberRows = await tx.execute(
      sql`SELECT * FROM pms_loyalty_members WHERE id = ${input.memberId} AND tenant_id = ${ctx.tenantId} LIMIT 1 FOR UPDATE`,
    );
    const member = Array.from(memberRows as Iterable<Record<string, unknown>>)[0];

    if (!member) throw new NotFoundError('Loyalty member', input.memberId);

    const currentBalance = Number(member.points_balance);
    const currentLifetime = Number(member.lifetime_points);
    const newBalance = currentBalance + input.points;
    if (newBalance < 0) {
      throw new AppError('NEGATIVE_BALANCE', 'Adjustment would result in negative balance', 400);
    }

    const newLifetime = input.points > 0
      ? currentLifetime + input.points
      : currentLifetime;

    await tx
      .update(pmsLoyaltyMembers)
      .set({
        pointsBalance: newBalance,
        lifetimePoints: newLifetime,
      })
      .where(and(eq(pmsLoyaltyMembers.id, input.memberId), eq(pmsLoyaltyMembers.tenantId, ctx.tenantId)));

    const [transaction] = await tx
      .insert(pmsLoyaltyTransactions)
      .values({
        tenantId: ctx.tenantId,
        memberId: input.memberId,
        transactionType: 'adjust',
        points: input.points,
        balanceAfter: newBalance,
        description: input.reason,
        createdBy: ctx.user?.id ?? null,
      })
      .returning();

    const event = buildEventFromContext(ctx, PMS_EVENTS.LOYALTY_POINTS_ADJUSTED, {
      memberId: input.memberId,
      points: input.points,
      balanceAfter: newBalance,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'adjustLoyaltyPoints', transaction!);
    return { result: transaction!, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.loyalty.points_adjusted', 'pms_loyalty_transaction', result.id);
  return result;
}
