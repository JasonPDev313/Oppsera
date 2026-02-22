import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { paymentSettlements, paymentSettlementLines } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { MatchSettlementTendersInput } from '../validation';

export async function matchSettlementTenders(
  ctx: RequestContext,
  input: MatchSettlementTendersInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify settlement exists and is in matchable state
    const [settlement] = await tx
      .select()
      .from(paymentSettlements)
      .where(
        and(
          eq(paymentSettlements.tenantId, ctx.tenantId),
          eq(paymentSettlements.id, input.settlementId),
        ),
      )
      .limit(1);

    if (!settlement) {
      throw new NotFoundError('Payment Settlement', input.settlementId);
    }

    if (settlement.status === 'posted') {
      throw new Error('Cannot match tenders on a posted settlement');
    }

    let matchedCount = 0;

    for (const match of input.matches) {
      const [line] = await tx
        .select()
        .from(paymentSettlementLines)
        .where(
          and(
            eq(paymentSettlementLines.tenantId, ctx.tenantId),
            eq(paymentSettlementLines.id, match.settlementLineId),
            eq(paymentSettlementLines.settlementId, input.settlementId),
          ),
        )
        .limit(1);

      if (!line) {
        throw new NotFoundError('Settlement Line', match.settlementLineId);
      }

      await tx
        .update(paymentSettlementLines)
        .set({
          tenderId: match.tenderId,
          status: 'matched',
          matchedAt: new Date(),
        })
        .where(
          and(
            eq(paymentSettlementLines.tenantId, ctx.tenantId),
            eq(paymentSettlementLines.id, match.settlementLineId),
          ),
        );

      matchedCount++;
    }

    // Check if all lines are now matched → update settlement status
    const unmatchedLines = await tx
      .select({ id: paymentSettlementLines.id })
      .from(paymentSettlementLines)
      .where(
        and(
          eq(paymentSettlementLines.tenantId, ctx.tenantId),
          eq(paymentSettlementLines.settlementId, input.settlementId),
          eq(paymentSettlementLines.status, 'unmatched'),
        ),
      )
      .limit(1);

    if (unmatchedLines.length === 0) {
      await tx
        .update(paymentSettlements)
        .set({ status: 'matched', updatedAt: new Date() })
        .where(
          and(
            eq(paymentSettlements.tenantId, ctx.tenantId),
            eq(paymentSettlements.id, input.settlementId),
          ),
        );
    }

    const event = buildEventFromContext(ctx, 'accounting.settlement.matched.v1', {
      settlementId: input.settlementId,
      matchedCount,
    });

    return { result: { settlementId: input.settlementId, matchedCount }, events: [event] };
  });

  await auditLog(ctx, 'accounting.settlement.matched', 'payment_settlement', input.settlementId);
  return result;
}
