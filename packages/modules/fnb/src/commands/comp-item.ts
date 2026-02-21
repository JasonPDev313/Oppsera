import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { CheckCompedPayload } from '../events/types';
import type { CompItemInput } from '../validation';

export async function compItem(
  ctx: RequestContext,
  locationId: string,
  input: CompItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'compItem');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Fetch order line to get amount for comp
    const lines = await tx.execute(
      sql`SELECT id, unit_price_cents, quantity FROM order_lines
          WHERE id = ${input.orderLineId} AND order_id = ${input.orderId}`,
    );
    const lineRows = Array.from(lines as Iterable<Record<string, unknown>>);
    if (lineRows.length === 0) {
      throw new Error(`Order line ${input.orderLineId} not found`);
    }

    const line = lineRows[0]!;
    const compAmountCents = Number(line.unit_price_cents) * Number(line.quantity);

    // Insert comp as an order discount
    const [created] = await tx.execute(
      sql`INSERT INTO order_discounts (
            order_id, type, value, amount, reason, created_by
          )
          VALUES (
            ${input.orderId}, 'comp', ${compAmountCents}, ${compAmountCents},
            ${input.reason}, ${ctx.user.id}
          )
          RETURNING *`,
    );

    const row = created as Record<string, unknown>;

    const payload: CheckCompedPayload = {
      orderId: input.orderId,
      orderLineId: input.orderLineId,
      locationId,
      compAmountCents,
      reason: input.reason,
      compedBy: ctx.user.id,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.CHECK_COMPED, payload as unknown as Record<string, unknown>);

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'compItem', row);
    }

    return { result: row, events: [event] };
  });

  await auditLog(ctx, 'fnb.check.comped', 'order_discounts', (result as Record<string, unknown>).id as string);
  return result;
}
