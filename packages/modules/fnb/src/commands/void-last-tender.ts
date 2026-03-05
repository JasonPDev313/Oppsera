import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { FNB_EVENTS } from '../events/types';
import type { TenderVoidedPayload } from '../events/types';
import { PaymentSessionNotFoundError, PaymentSessionStatusConflictError } from '../errors';

interface VoidLastTenderResult {
  sessionId: string;
  paidAmountCents: number;
  remainingAmountCents: number;
  sessionStatus: string;
}

/**
 * Reverse the most recent tender on a payment session.
 *
 * This command:
 *  1. Fetches the session with FOR UPDATE to prevent races
 *  2. Reads the last tender amount from the outbox/event log
 *     (or falls back to resetting paid to 0 if only one tender)
 *  3. Updates paid_amount_cents and remaining_amount_cents
 *  4. Reverts status back to in_progress (or pending if now $0 paid)
 *
 * Gateway void/refund must be handled by the caller BEFORE invoking
 * this command — this only handles the session accounting.
 */
export async function voidLastTender(
  ctx: RequestContext,
  locationId: string,
  sessionId: string,
): Promise<VoidLastTenderResult> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Lock the session row to prevent concurrent voids
    const sessions = await tx.execute(
      sql`SELECT id, tab_id, order_id, status, total_amount_cents, paid_amount_cents, remaining_amount_cents
          FROM fnb_payment_sessions
          WHERE id = ${sessionId} AND tenant_id = ${ctx.tenantId}
          FOR UPDATE`,
    );
    const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
    if (rows.length === 0) throw new PaymentSessionNotFoundError(sessionId);

    const session = rows[0]!;
    const status = session.status as string;

    if (status === 'completed') {
      throw new PaymentSessionStatusConflictError(sessionId, status, 'void tender on');
    }
    if (status === 'failed') {
      throw new PaymentSessionStatusConflictError(sessionId, status, 'void tender on');
    }

    const totalCents = Number(session.total_amount_cents);
    const currentPaid = Number(session.paid_amount_cents);

    if (currentPaid <= 0) {
      throw new PaymentSessionStatusConflictError(sessionId, status, 'void tender on (no tenders recorded)');
    }

    // Find the most recent tender amount from the outbox events for this session.
    // The TENDER_APPLIED events store the individual tender amounts.
    const tenderEvents = await tx.execute(
      sql`SELECT payload->>'amountCents' AS amount_cents
          FROM event_outbox
          WHERE tenant_id = ${ctx.tenantId}
            AND event_type = ${FNB_EVENTS.TENDER_APPLIED}
            AND payload->>'paymentSessionId' = ${sessionId}
          ORDER BY created_at DESC
          LIMIT 1`,
    );
    const tenderRows = Array.from(tenderEvents as Iterable<Record<string, unknown>>);
    const lastTenderAmount = tenderRows.length > 0
      ? Number(tenderRows[0]!.amount_cents)
      : currentPaid; // fallback: reverse entire paid amount

    const newPaid = Math.max(0, currentPaid - lastTenderAmount);
    const newRemaining = totalCents - newPaid;
    const newStatus = newPaid <= 0 ? 'pending' : 'in_progress';

    await tx.execute(
      sql`UPDATE fnb_payment_sessions
          SET paid_amount_cents = ${newPaid},
              remaining_amount_cents = ${Math.max(0, newRemaining)},
              status = ${newStatus},
              completed_at = NULL,
              updated_at = NOW()
          WHERE id = ${sessionId} AND tenant_id = ${ctx.tenantId}`,
    );

    const payload: TenderVoidedPayload = {
      paymentSessionId: sessionId,
      tabId: session.tab_id as string,
      orderId: session.order_id as string,
      locationId,
      reversedAmountCents: lastTenderAmount,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TENDER_VOIDED, payload as unknown as Record<string, unknown>);

    const voidResult: VoidLastTenderResult = {
      sessionId,
      paidAmountCents: newPaid,
      remainingAmountCents: Math.max(0, newRemaining),
      sessionStatus: newStatus,
    };

    return { result: voidResult, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.payment.tender_voided', 'fnb_payment_sessions', sessionId);
  return result as VoidLastTenderResult;
}
