import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { CloseBatchNotFoundError, CloseBatchStatusConflictError } from '../errors';

interface LockCloseBatchInput {
  closeBatchId: string;
}

export async function lockCloseBatch(ctx: RequestContext, input: LockCloseBatchInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const batchRows = await tx.execute(
      sql`SELECT id, status FROM fnb_close_batches
          WHERE id = ${input.closeBatchId} AND tenant_id = ${ctx.tenantId}`,
    );
    const batches = Array.from(batchRows as Iterable<Record<string, unknown>>);
    if (batches.length === 0) throw new CloseBatchNotFoundError(input.closeBatchId);

    const batch = batches[0]!;
    if (batch.status !== 'posted') {
      throw new CloseBatchStatusConflictError(input.closeBatchId, batch.status as string, 'posted');
    }

    const rows = await tx.execute(
      sql`UPDATE fnb_close_batches
          SET status = 'locked',
              locked_at = NOW(),
              updated_at = NOW()
          WHERE id = ${input.closeBatchId}
          RETURNING id, status, locked_at`,
    );
    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
    return { result: updated, events: [] };
  });

  await auditLog(ctx, 'fnb.close_batch.locked', 'close_batch', input.closeBatchId);
  return result;
}
