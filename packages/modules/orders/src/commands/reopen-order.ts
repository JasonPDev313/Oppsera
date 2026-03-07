import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, tenders } from '@oppsera/db';
import { and, eq } from 'drizzle-orm';
import type { ReopenOrderInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';

/**
 * Reopen a voided order (status recovery only).
 *
 * Orders that had tenders recorded cannot be reopened — voiding reversed
 * those payments (gateway voids, GL reversals) and reopening would leave
 * the order in an active state backed by reversed financial records.
 *
 * Only orders voided before any payment was taken are eligible.
 */
export async function reopenOrder(ctx: RequestContext, orderId: string, input: ReopenOrderInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'reopenOrder');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB

    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, ['voided']);

    // Block reopen if the order ever had tenders — voiding reversed those
    // payments (gateway voids, GL reversals) and reopening would leave the
    // order in an active state backed by reversed financial records.
    const [tenderRow] = await tx
      .select({ id: tenders.id })
      .from(tenders)
      .where(and(eq(tenders.tenantId, ctx.tenantId), eq(tenders.orderId, orderId)))
      .limit(1);

    if (tenderRow) {
      throw new AppError(
        'REOPEN_HAS_TENDERS',
        'Cannot reopen an order that had payments recorded. Voiding reversed those payments — reopening would leave the order in an inconsistent financial state.',
        409,
      );
    }

    const now = new Date();
    await tx.update(orders).set({
      status: 'open',
      voidedAt: null,
      voidReason: null,
      voidedBy: null,
      updatedBy: ctx.user.id,
      updatedAt: now,
    }).where(and(eq(orders.id, orderId), eq(orders.tenantId, ctx.tenantId)));

    await incrementVersion(tx, orderId, ctx.tenantId);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'reopenOrder', { orderId });

    const event = buildEventFromContext(ctx, 'order.reopened.v1', {
      orderId,
      orderNumber: order.orderNumber,
      previousStatus: 'voided',
    });

    return {
      result: { ...order, status: 'open', voidedAt: null, voidReason: null, version: order.version + 1 },
      events: [event],
    };
  });

  auditLogDeferred(ctx, 'order.reopened', 'order', orderId);
  return result;
}
