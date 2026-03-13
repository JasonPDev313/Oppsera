import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant } from '@oppsera/db';
import { paymentSettlements } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { VoidSettlementInput } from '../validation';
import { voidJournalEntry } from './void-journal-entry';
import { ACCOUNTING_EVENTS } from '../events/types';

export async function voidSettlement(
  ctx: RequestContext,
  input: VoidSettlementInput,
) {
  // Phase 1: Read settlement and validate (outside transaction)
  const settlement = await withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(paymentSettlements)
      .where(
        and(
          eq(paymentSettlements.tenantId, ctx.tenantId),
          eq(paymentSettlements.id, input.settlementId),
        ),
      )
      .limit(1);
    return row;
  });

  if (!settlement) {
    throw new NotFoundError('Payment Settlement', input.settlementId);
  }

  if (settlement.status !== 'posted') {
    throw new Error('Only posted settlements can be voided');
  }

  // Phase 2: Void the GL journal entry using the canonical void mechanism.
  // voidJournalEntry wraps its own publishWithOutbox so it runs in a separate
  // transaction. It handles period-lock check, reversal entry with swapped
  // debits/credits, balance validation, and its own idempotency.
  if (settlement.glJournalEntryId) {
    await voidJournalEntry(
      ctx,
      settlement.glJournalEntryId,
      `Settlement void: ${input.reason}`,
      `void-settlement-${input.clientRequestId}`,
    );
  }

  // Phase 3: Update settlement status with optimistic lock
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'voidSettlement');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Optimistic lock: only void if still 'posted'. Prevents concurrent void race
    // and guards against status changes between Phase 1 read and Phase 3 write.
    const [voided] = await tx
      .update(paymentSettlements)
      .set({
        status: 'voided',
        notes: `VOIDED: ${input.reason}${settlement.notes ? ` | Original notes: ${settlement.notes}` : ''}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentSettlements.tenantId, ctx.tenantId),
          eq(paymentSettlements.id, input.settlementId),
          eq(paymentSettlements.status, 'posted'),
        ),
      )
      .returning({ id: paymentSettlements.id });

    if (!voided) {
      throw new Error('Settlement was already voided by a concurrent request');
    }

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.SETTLEMENT_VOIDED, {
      settlementId: settlement.id,
      reason: input.reason,
    });

    const resultPayload = { ...settlement, status: 'voided' as const };

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'voidSettlement', resultPayload);

    return {
      result: resultPayload,
      events: [event],
    };
  });

  auditLogDeferred(ctx, 'accounting.settlement.voided', 'payment_settlement', input.settlementId);
  return result;
}
