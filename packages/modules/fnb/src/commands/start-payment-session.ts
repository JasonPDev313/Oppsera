import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { PaymentStartedPayload } from '../events/types';
import type { StartPaymentSessionInput } from '../validation';

export async function startPaymentSession(
  ctx: RequestContext,
  locationId: string,
  input: StartPaymentSessionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'startPaymentSession');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    const [created] = await tx.execute(
      sql`INSERT INTO fnb_payment_sessions (
            tenant_id, tab_id, order_id, status,
            total_amount_cents, paid_amount_cents, remaining_amount_cents
          )
          VALUES (
            ${ctx.tenantId}, ${input.tabId}, ${input.orderId}, 'pending',
            ${input.totalAmountCents}, 0, ${input.totalAmountCents}
          )
          RETURNING *`,
    );

    const row = created as Record<string, unknown>;
    const sessionId = row.id as string;

    // Update tab status to paying
    await tx.execute(
      sql`UPDATE fnb_tabs
          SET status = 'paying', updated_at = NOW(), version = version + 1
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );

    const payload: PaymentStartedPayload = {
      paymentSessionId: sessionId,
      tabId: input.tabId,
      orderId: input.orderId,
      locationId,
      totalAmountCents: input.totalAmountCents,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.PAYMENT_STARTED, payload as unknown as Record<string, unknown>);

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'startPaymentSession', row);
    }

    return { result: row, events: [event] };
  });

  const sessionId = (result as Record<string, unknown>).id as string;
  await auditLog(ctx, 'fnb.payment_session.started', 'fnb_payment_sessions', sessionId);
  return result;
}
