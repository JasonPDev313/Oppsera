import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { PaymentCompletedPayload } from '../events/types';
import { PaymentSessionNotFoundError, PaymentSessionStatusConflictError } from '../errors';
import type { CompletePaymentSessionInput } from '../validation';

export async function completePaymentSession(
  ctx: RequestContext,
  locationId: string,
  input: CompletePaymentSessionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'completePaymentSession');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Fetch session
    const sessions = await tx.execute(
      sql`SELECT id, tab_id, order_id, status, total_amount_cents, paid_amount_cents
          FROM fnb_payment_sessions
          WHERE id = ${input.sessionId} AND tenant_id = ${ctx.tenantId}`,
    );
    const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
    if (rows.length === 0) throw new PaymentSessionNotFoundError(input.sessionId);

    const session = rows[0]!;
    const status = session.status as string;

    if (status !== 'pending' && status !== 'in_progress') {
      throw new PaymentSessionStatusConflictError(input.sessionId, status, 'complete');
    }

    // Update session to completed
    const [updated] = await tx.execute(
      sql`UPDATE fnb_payment_sessions
          SET status = 'completed', remaining_amount_cents = 0,
              completed_at = NOW(), updated_at = NOW()
          WHERE id = ${input.sessionId} AND tenant_id = ${ctx.tenantId}
          RETURNING *`,
    );

    const updatedRow = updated as Record<string, unknown>;
    const tabId = session.tab_id as string;

    // Close tab
    await tx.execute(
      sql`UPDATE fnb_tabs
          SET status = 'closed', closed_at = NOW(), updated_at = NOW(), version = version + 1
          WHERE id = ${tabId} AND tenant_id = ${ctx.tenantId}`,
    );

    const payload: PaymentCompletedPayload = {
      paymentSessionId: input.sessionId,
      tabId,
      orderId: session.order_id as string,
      locationId,
      totalTendersCents: Number(session.paid_amount_cents),
      changeCents: input.changeCents ?? 0,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.PAYMENT_COMPLETED, payload as unknown as Record<string, unknown>);

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'completePaymentSession', updatedRow);
    }

    return { result: updatedRow, events: [event] };
  });

  await auditLog(ctx, 'fnb.payment_session.completed', 'fnb_payment_sessions', input.sessionId);
  return result;
}
