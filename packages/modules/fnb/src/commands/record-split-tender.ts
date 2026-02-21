import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { TenderAppliedPayload } from '../events/types';
import { PaymentSessionNotFoundError, PaymentSessionStatusConflictError, CheckAlreadyPaidError } from '../errors';

interface RecordSplitTenderInput {
  clientRequestId?: string;
  sessionId: string;
  tenderId: string;
  amountCents: number;
  tenderType: string;
}

export async function recordSplitTender(
  ctx: RequestContext,
  locationId: string,
  input: RecordSplitTenderInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'recordSplitTender');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Fetch payment session
    const sessions = await tx.execute(
      sql`SELECT id, tab_id, order_id, status, total_amount_cents, paid_amount_cents, remaining_amount_cents
          FROM fnb_payment_sessions
          WHERE id = ${input.sessionId} AND tenant_id = ${ctx.tenantId}`,
    );
    const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
    if (rows.length === 0) throw new PaymentSessionNotFoundError(input.sessionId);

    const session = rows[0]!;
    const status = session.status as string;

    if (status === 'completed') throw new CheckAlreadyPaidError(session.order_id as string);
    if (status === 'failed') {
      throw new PaymentSessionStatusConflictError(input.sessionId, status, 'record tender on');
    }

    const newPaidAmount = Number(session.paid_amount_cents) + input.amountCents;
    const newRemaining = Number(session.total_amount_cents) - newPaidAmount;
    const newStatus = newRemaining <= 0 ? 'completed' : 'in_progress';

    // Update session amounts
    await tx.execute(
      sql`UPDATE fnb_payment_sessions
          SET paid_amount_cents = ${newPaidAmount},
              remaining_amount_cents = ${Math.max(0, newRemaining)},
              status = ${newStatus},
              completed_at = ${newRemaining <= 0 ? sql`NOW()` : sql`NULL`},
              updated_at = NOW()
          WHERE id = ${input.sessionId} AND tenant_id = ${ctx.tenantId}`,
    );

    const payload: TenderAppliedPayload = {
      paymentSessionId: input.sessionId,
      tenderId: input.tenderId,
      tabId: session.tab_id as string,
      orderId: session.order_id as string,
      locationId,
      amountCents: input.amountCents,
      tenderType: input.tenderType,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TENDER_APPLIED, payload as unknown as Record<string, unknown>);

    const tenderResult = {
      sessionId: input.sessionId,
      tenderId: input.tenderId,
      paidAmountCents: newPaidAmount,
      remainingAmountCents: Math.max(0, newRemaining),
      sessionStatus: newStatus,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recordSplitTender', tenderResult);
    }

    return { result: tenderResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.payment.tender_applied', 'fnb_payment_sessions', input.sessionId);
  return result;
}
