import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { TenderAppliedPayload } from '../events/types';
import { PaymentSessionNotFoundError, PaymentSessionStatusConflictError, CheckAlreadyPaidError } from '../errors';
import type { RecordSplitTenderInput } from '../validation';

export async function recordSplitTender(
  ctx: RequestContext,
  locationId: string,
  input: RecordSplitTenderInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'recordSplitTender');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // Lock session row — prevents concurrent tender races (retail pattern: fetchOrderForMutation)
    const sessions = await tx.execute(
      sql`SELECT id, tab_id, order_id, status, total_amount_cents, paid_amount_cents, remaining_amount_cents
          FROM fnb_payment_sessions
          WHERE id = ${input.sessionId} AND tenant_id = ${ctx.tenantId}
          FOR UPDATE`,
    );
    const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
    if (rows.length === 0) throw new PaymentSessionNotFoundError(input.sessionId);

    const session = rows[0]!;
    const status = session.status as string;

    if (status === 'completed') throw new CheckAlreadyPaidError(session.order_id as string);
    if (status === 'failed') {
      throw new PaymentSessionStatusConflictError(input.sessionId, status, 'record tender on');
    }

    const currentPaid = Number(session.paid_amount_cents);
    const totalAmount = Number(session.total_amount_cents);
    const newPaidAmount = currentPaid + input.amountCents;
    const newRemaining = totalAmount - newPaidAmount;

    // Reject tenders that would overpay the session
    if (newRemaining < 0) {
      throw new PaymentSessionStatusConflictError(
        input.sessionId,
        status,
        `tender ${input.amountCents} cents (remaining: ${totalAmount - currentPaid} cents) on`,
      );
    }

    // Do NOT auto-complete the session here — completePaymentSession handles
    // tab closing, table status reset, and the PAYMENT_COMPLETED event.
    // Setting status to 'completed' here would cause the frontend to skip
    // the explicit completeSession call, leaving the tab stuck in 'paying'.

    // Optimistic lock: WHERE paid_amount_cents = currentPaid prevents double-counting
    // if two concurrent tenders race on the same session.
    const updateResult = await tx.execute(
      sql`UPDATE fnb_payment_sessions
          SET paid_amount_cents = ${newPaidAmount},
              remaining_amount_cents = ${newRemaining},
              updated_at = NOW()
          WHERE id = ${input.sessionId}
            AND tenant_id = ${ctx.tenantId}
            AND paid_amount_cents = ${currentPaid}`,
    );
    const updatedCount = Number((updateResult as { count?: number }).count ?? 0);
    if (updatedCount === 0) {
      throw new PaymentSessionStatusConflictError(
        input.sessionId,
        status,
        'record tender on (concurrent modification detected — please retry)',
      );
    }

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
      sessionStatus: 'in_progress',
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'recordSplitTender', tenderResult);
    }

    return { result: tenderResult, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.payment.tender_applied', 'fnb_payment_sessions', input.sessionId);
  return result;
}
