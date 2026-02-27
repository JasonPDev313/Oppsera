import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderCharges } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import type { SetServiceChargeExemptInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';

export async function setServiceChargeExempt(
  ctx: RequestContext,
  orderId: string,
  input: SetServiceChargeExemptInput,
) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'setServiceChargeExempt',
    );
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    if (input.serviceChargeExempt) {
      // Remove all service charges when exempt
      await (tx as any).delete(orderCharges)
        .where(eq(orderCharges.orderId, orderId));
    }

    await (tx as any).update(orders).set({
      serviceChargeExempt: input.serviceChargeExempt,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    await incrementVersion(tx, orderId);
    await saveIdempotencyKey(
      tx, ctx.tenantId, input.clientRequestId, 'setServiceChargeExempt',
      { serviceChargeExempt: input.serviceChargeExempt },
    );

    const event = buildEventFromContext(ctx, 'order.service_charge_exempt_changed.v1', {
      orderId,
      serviceChargeExempt: input.serviceChargeExempt,
    });

    return {
      result: {
        ...order,
        serviceChargeExempt: input.serviceChargeExempt,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'order.service_charge_exempt_changed', 'order', orderId);
  return result;
}
