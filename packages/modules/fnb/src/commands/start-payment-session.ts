import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { AppError } from '@oppsera/shared';
import { FNB_EVENTS } from '../events/types';
import type { PaymentStartedPayload } from '../events/types';
import { TabNotFoundError, TabStatusConflictError } from '../errors';
import type { StartPaymentSessionInput } from '../validation';

export async function startPaymentSession(
  ctx: RequestContext,
  locationId: string,
  input: StartPaymentSessionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'startPaymentSession');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // Lock tab row — prevents concurrent session starts and verifies status
    const tabRows = await tx.execute(
      sql`SELECT id, status FROM fnb_tabs
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
          FOR UPDATE`,
    );
    const tabs = Array.from(tabRows as Iterable<Record<string, unknown>>);
    if (tabs.length === 0) throw new TabNotFoundError(input.tabId);

    const tabStatus = tabs[0]!.status as string;
    const payableStatuses = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested', 'paying'];
    if (!payableStatuses.includes(tabStatus)) {
      throw new TabStatusConflictError(input.tabId, tabStatus, 'start payment on');
    }

    // Guard: reject if an active session already exists for this tab
    const activeCheck = await tx.execute(
      sql`SELECT id FROM fnb_payment_sessions
          WHERE tab_id = ${input.tabId} AND tenant_id = ${ctx.tenantId}
            AND status IN ('pending', 'in_progress')
          LIMIT 1`,
    );
    const activeRows = Array.from(activeCheck as Iterable<Record<string, unknown>>);
    if (activeRows.length > 0) {
      throw new AppError(
        'DUPLICATE_ACTIVE_SESSION',
        `Tab ${input.tabId} already has an active payment session`,
        409,
      );
    }

    // Cross-validate totalAmountCents against the actual order total
    const orderRows = await tx.execute(
      sql`SELECT total FROM orders
          WHERE id = ${input.orderId} AND tenant_id = ${ctx.tenantId}`,
    );
    const orders = Array.from(orderRows as Iterable<Record<string, unknown>>);
    if (orders.length > 0) {
      const orderTotal = Number(orders[0]!.total);
      if (orderTotal > 0 && input.totalAmountCents < orderTotal) {
        throw new AppError(
          'TOTAL_MISMATCH',
          'Payment session total cannot be less than the order total',
          400,
        );
      }
    }

    // Store pre-payment tab status so fail-payment-session can restore it
    const [created] = await tx.execute(
      sql`INSERT INTO fnb_payment_sessions (
            tenant_id, tab_id, order_id, status,
            total_amount_cents, paid_amount_cents, remaining_amount_cents,
            pre_payment_tab_status
          )
          VALUES (
            ${ctx.tenantId}, ${input.tabId}, ${input.orderId}, 'pending',
            ${input.totalAmountCents}, 0, ${input.totalAmountCents},
            ${tabStatus}
          )
          RETURNING *`,
    );

    const row = created as Record<string, unknown>;
    const sessionId = row.id as string;

    // Update tab status to paying (only if not already paying from a prior failed session)
    if (tabStatus !== 'paying') {
      await tx.execute(
        sql`UPDATE fnb_tabs
            SET status = 'paying', updated_at = NOW(), version = version + 1
            WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
      );
    }

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
  auditLogDeferred(ctx, 'fnb.payment_session.started', 'fnb_payment_sessions', sessionId);
  return result;
}
