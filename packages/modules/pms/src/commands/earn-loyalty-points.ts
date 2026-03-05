import { eq, sql, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { NotFoundError } from '@oppsera/shared';
import { pmsLoyaltyMembers, pmsLoyaltyTransactions } from '@oppsera/db';
import type { EarnLoyaltyPointsInput } from '../validation';
import { PMS_EVENTS } from '../events/types';

export async function earnLoyaltyPoints(
  ctx: RequestContext,
  input: EarnLoyaltyPointsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'earnLoyaltyPoints');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Lock the member row to prevent concurrent balance races (FOR UPDATE)
    const memberRows = await tx.execute(
      sql`SELECT * FROM pms_loyalty_members WHERE id = ${input.memberId} AND tenant_id = ${ctx.tenantId} LIMIT 1 FOR UPDATE`,
    );
    const member = Array.from(memberRows as Iterable<Record<string, unknown>>)[0];

    if (!member) throw new NotFoundError('Loyalty member', input.memberId);

    const newBalance = Number(member.points_balance) + input.points;
    const newLifetime = Number(member.lifetime_points) + input.points;

    // Update member balance
    await tx
      .update(pmsLoyaltyMembers)
      .set({
        pointsBalance: newBalance,
        lifetimePoints: newLifetime,
      })
      .where(and(eq(pmsLoyaltyMembers.id, input.memberId), eq(pmsLoyaltyMembers.tenantId, ctx.tenantId)));

    // Record transaction
    const [transaction] = await tx
      .insert(pmsLoyaltyTransactions)
      .values({
        tenantId: ctx.tenantId,
        memberId: input.memberId,
        transactionType: 'earn',
        points: input.points,
        balanceAfter: newBalance,
        reservationId: input.reservationId ?? null,
        description: input.description ?? null,
        createdBy: ctx.user?.id ?? null,
      })
      .returning();

    const event = buildEventFromContext(ctx, PMS_EVENTS.LOYALTY_POINTS_EARNED, {
      memberId: input.memberId,
      points: input.points,
      balanceAfter: newBalance,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'earnLoyaltyPoints', transaction!);
    return { result: transaction!, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.loyalty.points_earned', 'pms_loyalty_transaction', result.id);
  return result;
}
