import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders } from '@oppsera/db';
import type { OpenOrderInput } from '../validation';
import { getNextOrderNumber } from '../helpers/order-number';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';

export async function openOrder(ctx: RequestContext, input: OpenOrderInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const businessDate = input.businessDate ?? new Date().toISOString().split('T')[0]!;

  const order = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'openOrder');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    const orderNumber = await getNextOrderNumber(tx, ctx.tenantId, ctx.locationId!);

    const [created] = await tx.insert(orders).values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!,
      orderNumber,
      status: 'open',
      source: input.source ?? 'pos',
      customerId: input.customerId ?? null,
      businessDate,
      notes: input.notes ?? null,
      terminalId: input.terminalId ?? null,
      employeeId: input.employeeId ?? null,
      shiftId: input.shiftId ?? null,
      metadata: input.metadata ?? null,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    }).returning();

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'openOrder', created!);

    const event = buildEventFromContext(ctx, 'order.opened.v1', {
      orderId: created!.id,
      orderNumber: created!.orderNumber,
      locationId: ctx.locationId!,
      source: created!.source,
      businessDate,
    });

    return { result: created!, events: [event] };
  });

  // Fire-and-forget audit log — don't block the API response
  auditLog(ctx, 'order.opened', 'order', order.id).catch(() => {});
  return order;
}
