import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { CloseBatchNotFoundError, CloseBatchStatusConflictError } from '../errors';

interface RetryBatchPostingInput {
  closeBatchId: string;
}

export async function retryBatchPosting(ctx: RequestContext, input: RetryBatchPostingInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const batchRows = await tx.execute(
      sql`SELECT id, status, location_id, business_date FROM fnb_close_batches
          WHERE id = ${input.closeBatchId} AND tenant_id = ${ctx.tenantId}`,
    );
    const batches = Array.from(batchRows as Iterable<Record<string, unknown>>);
    if (batches.length === 0) throw new CloseBatchNotFoundError(input.closeBatchId);

    const batch = batches[0]!;
    // Can only retry from reconciled state (failed posting reverts back to reconciled)
    if (batch.status !== 'reconciled') {
      throw new CloseBatchStatusConflictError(input.closeBatchId, batch.status as string, 'reconciled');
    }

    // The actual retry is delegated to postBatchToGl — this just validates eligibility
    return {
      result: {
        closeBatchId: input.closeBatchId,
        status: 'eligible_for_retry',
        locationId: batch.location_id as string,
        businessDate: batch.business_date as string,
      },
      events: [],
    };
  });

  await auditLog(ctx, 'fnb.gl_posting.retry_checked', 'close_batch', input.closeBatchId);
  return result;
}
