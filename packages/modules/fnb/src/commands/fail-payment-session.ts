import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { PaymentFailedPayload } from '../events/types';
import { PaymentSessionNotFoundError, PaymentSessionStatusConflictError } from '../errors';
import type { FailPaymentSessionInput } from '../validation';

export async function failPaymentSession(
  ctx: RequestContext,
  locationId: string,
  input: FailPaymentSessionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'failPaymentSession');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // Lock session row — prevents double-fail race
    const sessions = await tx.execute(
      sql`SELECT id, tab_id, order_id, status, pre_payment_tab_status
          FROM fnb_payment_sessions
          WHERE id = ${input.sessionId} AND tenant_id = ${ctx.tenantId}
          FOR UPDATE`,
    );
    const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
    if (rows.length === 0) throw new PaymentSessionNotFoundError(input.sessionId);

    const session = rows[0]!;
    const status = session.status as string;

    if (status !== 'pending' && status !== 'in_progress') {
      throw new PaymentSessionStatusConflictError(input.sessionId, status, 'fail');
    }

    // CAS update — only fail if status is still eligible
    const updated = await tx.execute(
      sql`UPDATE fnb_payment_sessions
          SET status = 'failed', updated_at = NOW()
          WHERE id = ${input.sessionId} AND tenant_id = ${ctx.tenantId}
            AND status IN ('pending', 'in_progress')
          RETURNING *`,
    );
    const updatedRows = Array.from(updated as Iterable<Record<string, unknown>>);
    if (updatedRows.length === 0) {
      throw new PaymentSessionStatusConflictError(input.sessionId, status, 'fail');
    }

    const updatedRow = updatedRows[0]!;
    const tabId = session.tab_id as string;

    // Revert tab status from 'paying' back to pre-payment status (not always 'open' —
    // tab may have been in 'sent_to_kitchen', 'in_progress', etc.)
    const restoreStatus = (session.pre_payment_tab_status as string) || 'open';
    await tx.execute(
      sql`UPDATE fnb_tabs
          SET status = ${restoreStatus}, updated_at = NOW(), version = version + 1
          WHERE id = ${tabId} AND tenant_id = ${ctx.tenantId}
            AND status = 'paying'`,
    );

    const payload: PaymentFailedPayload = {
      paymentSessionId: input.sessionId,
      tabId,
      orderId: session.order_id as string,
      locationId,
      reason: input.reason,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.PAYMENT_FAILED, payload as unknown as Record<string, unknown>);

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'failPaymentSession', updatedRow);
    }

    return { result: updatedRow, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.payment_session.failed', 'fnb_payment_sessions', input.sessionId);
  return result;
}
