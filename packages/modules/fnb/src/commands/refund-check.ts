import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { CheckRefundedPayload } from '../events/types';
import { RefundExceedsTenderError } from '../errors';
import type { RefundCheckInput } from '../validation';

export async function refundCheck(
  ctx: RequestContext,
  locationId: string,
  orderId: string,
  input: RefundCheckInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'refundCheck');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Verify tender exists and refund doesn't exceed amount
    const tenders = await tx.execute(
      sql`SELECT id, amount, order_id FROM tenders
          WHERE id = ${input.tenderId} AND tenant_id = ${ctx.tenantId}`,
    );
    const tenderRows = Array.from(tenders as Iterable<Record<string, unknown>>);
    if (tenderRows.length === 0) {
      throw new Error(`Tender ${input.tenderId} not found`);
    }

    const tender = tenderRows[0]!;
    if (input.amountCents > Number(tender.amount)) {
      throw new RefundExceedsTenderError(input.tenderId);
    }

    // Create tender reversal
    const [created] = await tx.execute(
      sql`INSERT INTO tender_reversals (
            original_tender_id, order_id, reversal_type, amount,
            reason, refund_method, status
          )
          VALUES (
            ${input.tenderId}, ${orderId}, 'refund', ${input.amountCents},
            ${input.reason}, ${input.refundMethod ?? 'original'}, 'completed'
          )
          RETURNING *`,
    );

    const row = created as Record<string, unknown>;

    const payload: CheckRefundedPayload = {
      tenderId: row.id as string,
      orderId,
      locationId,
      refundAmountCents: input.amountCents,
      refundMethod: input.refundMethod ?? 'original',
      originalTenderId: input.tenderId,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.CHECK_REFUNDED, payload as unknown as Record<string, unknown>);

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'refundCheck', row);
    }

    return { result: row, events: [event] };
  });

  await auditLog(ctx, 'fnb.check.refunded', 'tender_reversals', (result as Record<string, unknown>).id as string);
  return result;
}
