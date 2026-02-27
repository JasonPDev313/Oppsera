import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { CloseBatchNotFoundError, CloseBatchStatusConflictError } from '../errors';
import { FNB_EVENTS } from '../events/types';
import type { CloseBatchPostedPayload } from '../events/types';

interface PostCloseBatchInput {
  closeBatchId: string;
  glJournalEntryId?: string;
  clientRequestId?: string;
}

export async function postCloseBatch(ctx: RequestContext, input: PostCloseBatchInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'postCloseBatch');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const batchRows = await tx.execute(
      sql`SELECT id, status, location_id, business_date FROM fnb_close_batches
          WHERE id = ${input.closeBatchId} AND tenant_id = ${ctx.tenantId}`,
    );
    const batches = Array.from(batchRows as Iterable<Record<string, unknown>>);
    if (batches.length === 0) throw new CloseBatchNotFoundError(input.closeBatchId);

    const batch = batches[0]!;
    if (batch.status !== 'reconciled') {
      throw new CloseBatchStatusConflictError(input.closeBatchId, batch.status as string, 'reconciled');
    }

    const rows = await tx.execute(
      sql`UPDATE fnb_close_batches
          SET status = 'posted',
              posted_at = NOW(),
              posted_by = ${ctx.user.id},
              gl_journal_entry_id = ${input.glJournalEntryId ?? null},
              updated_at = NOW()
          WHERE id = ${input.closeBatchId}
          RETURNING id, status, location_id, business_date, posted_at, posted_by, gl_journal_entry_id`,
    );
    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const payload: CloseBatchPostedPayload = {
      closeBatchId: input.closeBatchId,
      locationId: batch.location_id as string,
      businessDate: batch.business_date as string,
      postedBy: ctx.user.id,
      glJournalEntryId: input.glJournalEntryId ?? null,
    };
    const event = buildEventFromContext(ctx, FNB_EVENTS.CLOSE_BATCH_POSTED, payload as unknown as Record<string, unknown>);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'postCloseBatch', updated);

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'fnb.close_batch.posted', 'close_batch', input.closeBatchId);
  return result;
}
