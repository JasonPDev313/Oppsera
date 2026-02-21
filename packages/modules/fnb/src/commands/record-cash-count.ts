import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit';
import { CloseBatchNotFoundError, CloseBatchStatusConflictError } from '../errors';

interface RecordCashCountInput {
  closeBatchId: string;
  cashCountedCents: number;
}

export async function recordCashCount(ctx: RequestContext, input: RecordCashCountInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate close batch
    const batchRows = await tx.execute(
      sql`SELECT id, status FROM fnb_close_batches
          WHERE id = ${input.closeBatchId} AND tenant_id = ${ctx.tenantId}`,
    );
    const batches = Array.from(batchRows as Iterable<Record<string, unknown>>);
    if (batches.length === 0) throw new CloseBatchNotFoundError(input.closeBatchId);

    const batch = batches[0]!;
    if (batch.status !== 'open' && batch.status !== 'in_progress') {
      throw new CloseBatchStatusConflictError(input.closeBatchId, batch.status as string, 'open or in_progress');
    }

    // Get the summary to calculate expected cash
    const summaryRows = await tx.execute(
      sql`SELECT id, cash_starting_float_cents, cash_sales_cents, cash_tips_cents,
                 cash_drops_cents, cash_paid_outs_cents
          FROM fnb_close_batch_summaries
          WHERE close_batch_id = ${input.closeBatchId}`,
    );
    const summaries = Array.from(summaryRows as Iterable<Record<string, unknown>>);
    if (summaries.length === 0) throw new CloseBatchNotFoundError(input.closeBatchId);

    const summary = summaries[0]!;
    const cashExpectedCents =
      Number(summary.cash_starting_float_cents) +
      Number(summary.cash_sales_cents) +
      Number(summary.cash_tips_cents) -
      Number(summary.cash_drops_cents) -
      Number(summary.cash_paid_outs_cents);

    const cashOverShortCents = input.cashCountedCents - cashExpectedCents;

    const rows = await tx.execute(
      sql`UPDATE fnb_close_batch_summaries
          SET cash_expected_cents = ${cashExpectedCents},
              cash_counted_cents = ${input.cashCountedCents},
              cash_over_short_cents = ${cashOverShortCents},
              updated_at = NOW()
          WHERE close_batch_id = ${input.closeBatchId}
          RETURNING id, close_batch_id, cash_expected_cents, cash_counted_cents, cash_over_short_cents`,
    );
    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
    return { result: updated, events: [] };
  });

  await auditLog(ctx, 'fnb.cash_count.recorded', 'close_batch', input.closeBatchId);
  return result;
}
