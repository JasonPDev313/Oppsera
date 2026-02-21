import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { CloseBatchNotFoundError, BatchNotPostedError } from '../errors';
import { FNB_EVENTS } from '../events/types';
import type { GlPostingReversedPayload } from '../events/types';

interface ReverseBatchPostingInput {
  closeBatchId: string;
  reason: string;
}

export async function reverseBatchPosting(ctx: RequestContext, input: ReverseBatchPostingInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const batchRows = await tx.execute(
      sql`SELECT id, status, location_id, business_date, gl_journal_entry_id
          FROM fnb_close_batches
          WHERE id = ${input.closeBatchId} AND tenant_id = ${ctx.tenantId}`,
    );
    const batches = Array.from(batchRows as Iterable<Record<string, unknown>>);
    if (batches.length === 0) throw new CloseBatchNotFoundError(input.closeBatchId);

    const batch = batches[0]!;
    if (!batch.gl_journal_entry_id || batch.status !== 'posted') {
      throw new BatchNotPostedError(input.closeBatchId);
    }

    const originalGlId = batch.gl_journal_entry_id as string;
    const reversalGlId = `fnb-batch-reversal-${input.closeBatchId}`;

    // Move batch back to reconciled and clear GL reference
    await tx.execute(
      sql`UPDATE fnb_close_batches
          SET status = 'reconciled',
              gl_journal_entry_id = NULL,
              posted_at = NULL,
              posted_by = NULL,
              notes = COALESCE(notes, '') || ' | Reversed: ' || ${input.reason},
              updated_at = NOW()
          WHERE id = ${input.closeBatchId}`,
    );

    const payload: GlPostingReversedPayload = {
      closeBatchId: input.closeBatchId,
      locationId: batch.location_id as string,
      businessDate: batch.business_date as string,
      originalGlJournalEntryId: originalGlId,
      reversalGlJournalEntryId: reversalGlId,
      reason: input.reason,
    };
    const event = buildEventFromContext(ctx, FNB_EVENTS.GL_POSTING_REVERSED, payload as unknown as Record<string, unknown>);

    return {
      result: {
        closeBatchId: input.closeBatchId,
        originalGlJournalEntryId: originalGlId,
        reversalGlJournalEntryId: reversalGlId,
        reason: input.reason,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'fnb.gl_posting.reversed', 'close_batch', input.closeBatchId);
  return result;
}
