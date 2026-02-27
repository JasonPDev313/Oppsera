import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { paymentSettlements } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { VoidSettlementInput } from '../validation';

export async function voidSettlement(
  ctx: RequestContext,
  input: VoidSettlementInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'voidSettlement');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

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

    if (settlement.status !== 'posted') {
      throw new Error('Only posted settlements can be voided');
    }

    // Void the GL journal entry
    if (settlement.glJournalEntryId) {
      const postingApi = getAccountingPostingApi();
      await postingApi.postEntry(ctx, {
        businessDate: settlement.settlementDate,
        sourceModule: 'settlement',
        sourceReferenceId: `void-${settlement.id}`,
        memo: `VOID: Card settlement - ${settlement.processorName} - ${input.reason}`,
        lines: [], // Will be populated by the void reversal
        forcePost: true,
      });
    }

    // Update settlement status
    await tx
      .update(paymentSettlements)
      .set({
        status: 'disputed',
        notes: `VOIDED: ${input.reason}${settlement.notes ? ` | Original notes: ${settlement.notes}` : ''}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentSettlements.tenantId, ctx.tenantId),
          eq(paymentSettlements.id, input.settlementId),
        ),
      );

    const event = buildEventFromContext(ctx, 'accounting.settlement.voided.v1', {
      settlementId: settlement.id,
      reason: input.reason,
    });

    const resultPayload = { ...settlement, status: 'disputed' as const };

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'voidSettlement', resultPayload);

    return {
      result: resultPayload,
      events: [event],
    };
  });

  await auditLog(ctx, 'accounting.settlement.voided', 'payment_settlement', input.settlementId);
  return result;
}
