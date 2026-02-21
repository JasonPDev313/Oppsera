import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { CheckVoidedPayload } from '../events/types';
import type { VoidCheckInput } from '../validation';

export async function voidCheck(
  ctx: RequestContext,
  locationId: string,
  tabId: string,
  input: VoidCheckInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'voidCheck');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Void the order
    await tx.execute(
      sql`UPDATE orders
          SET status = 'voided', voided_at = NOW(), voided_by = ${ctx.user.id},
              void_reason = ${input.reason}, updated_at = NOW(), version = version + 1
          WHERE id = ${input.orderId} AND tenant_id = ${ctx.tenantId}`,
    );

    const payload: CheckVoidedPayload = {
      orderId: input.orderId,
      tabId,
      locationId,
      reason: input.reason,
      voidedBy: ctx.user.id,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.CHECK_VOIDED, payload as unknown as Record<string, unknown>);

    const voidResult = { orderId: input.orderId, status: 'voided' };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'voidCheck', voidResult);
    }

    return { result: voidResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.check.voided', 'orders', input.orderId);
  return result;
}
