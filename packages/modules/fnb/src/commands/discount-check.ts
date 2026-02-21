import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { CheckDiscountedPayload } from '../events/types';
import type { DiscountCheckInput } from '../validation';

export async function discountCheck(
  ctx: RequestContext,
  locationId: string,
  input: DiscountCheckInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'discountCheck');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    let amountCents: number;
    let percentage: number | null = null;

    if (input.discountType === 'percentage') {
      // Get order subtotal to compute discount
      const orders = await tx.execute(
        sql`SELECT subtotal FROM orders WHERE id = ${input.orderId}`,
      );
      const orderRows = Array.from(orders as Iterable<Record<string, unknown>>);
      if (orderRows.length === 0) {
        throw new Error(`Order ${input.orderId} not found`);
      }
      const subtotalCents = Number(orderRows[0]!.subtotal);
      amountCents = Math.round(subtotalCents * input.value / 100);
      percentage = input.value;
    } else {
      amountCents = Math.round(input.value);
    }

    // Insert discount
    const [created] = await tx.execute(
      sql`INSERT INTO order_discounts (
            order_id, type, value, amount, reason, created_by
          )
          VALUES (
            ${input.orderId}, 'discount', ${input.value}, ${amountCents},
            ${input.reason ?? null}, ${ctx.user.id}
          )
          RETURNING *`,
    );

    const row = created as Record<string, unknown>;

    const payload: CheckDiscountedPayload = {
      orderId: input.orderId,
      locationId,
      discountAmountCents: amountCents,
      discountType: input.discountType,
      percentage,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.CHECK_DISCOUNTED, payload as unknown as Record<string, unknown>);

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'discountCheck', row);
    }

    return { result: row, events: [event] };
  });

  await auditLog(ctx, 'fnb.check.discounted', 'order_discounts', (result as Record<string, unknown>).id as string);
  return result;
}
