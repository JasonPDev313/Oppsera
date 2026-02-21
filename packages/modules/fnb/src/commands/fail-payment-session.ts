import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
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
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Fetch session
    const sessions = await tx.execute(
      sql`SELECT id, tab_id, order_id, status
          FROM fnb_payment_sessions
          WHERE id = ${input.sessionId} AND tenant_id = ${ctx.tenantId}`,
    );
    const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
    if (rows.length === 0) throw new PaymentSessionNotFoundError(input.sessionId);

    const session = rows[0]!;
    const status = session.status as string;

    if (status !== 'pending' && status !== 'in_progress') {
      throw new PaymentSessionStatusConflictError(input.sessionId, status, 'fail');
    }

    // Update session to failed
    const [updated] = await tx.execute(
      sql`UPDATE fnb_payment_sessions
          SET status = 'failed', updated_at = NOW()
          WHERE id = ${input.sessionId} AND tenant_id = ${ctx.tenantId}
          RETURNING *`,
    );

    const updatedRow = updated as Record<string, unknown>;

    const payload: PaymentFailedPayload = {
      paymentSessionId: input.sessionId,
      tabId: session.tab_id as string,
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

  await auditLog(ctx, 'fnb.payment_session.failed', 'fnb_payment_sessions', input.sessionId);
  return result;
}
