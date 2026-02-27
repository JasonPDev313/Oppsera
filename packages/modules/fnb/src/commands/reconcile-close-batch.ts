import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { CloseBatchNotFoundError, CloseBatchStatusConflictError } from '../errors';
import { FNB_EVENTS } from '../events/types';
import type { CloseBatchReconciledPayload } from '../events/types';

interface ReconcileCloseBatchInput {
  closeBatchId: string;
  notes?: string;
  clientRequestId?: string;
}

export async function reconcileCloseBatch(ctx: RequestContext, input: ReconcileCloseBatchInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'reconcileCloseBatch');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const batchRows = await tx.execute(
      sql`SELECT id, status, location_id, business_date FROM fnb_close_batches
          WHERE id = ${input.closeBatchId} AND tenant_id = ${ctx.tenantId}`,
    );
    const batches = Array.from(batchRows as Iterable<Record<string, unknown>>);
    if (batches.length === 0) throw new CloseBatchNotFoundError(input.closeBatchId);

    const batch = batches[0]!;
    if (batch.status !== 'in_progress' && batch.status !== 'open') {
      throw new CloseBatchStatusConflictError(input.closeBatchId, batch.status as string, 'open or in_progress');
    }

    // Build the summary from actual transaction data
    // Aggregate cash drops for this batch
    const dropsRows = await tx.execute(
      sql`SELECT COALESCE(SUM(amount_cents), 0) as total
          FROM fnb_cash_drops
          WHERE tenant_id = ${ctx.tenantId}
            AND location_id = ${batch.location_id as string}
            AND business_date = ${batch.business_date as string}`,
    );
    const cashDropsCents = Number(Array.from(dropsRows as Iterable<Record<string, unknown>>)[0]!.total);

    // Aggregate paid outs for this batch
    const paidOutsRows = await tx.execute(
      sql`SELECT COALESCE(SUM(amount_cents), 0) as total
          FROM fnb_cash_paid_outs
          WHERE tenant_id = ${ctx.tenantId}
            AND location_id = ${batch.location_id as string}
            AND business_date = ${batch.business_date as string}`,
    );
    const cashPaidOutsCents = Number(Array.from(paidOutsRows as Iterable<Record<string, unknown>>)[0]!.total);

    // Update summary with aggregated data
    await tx.execute(
      sql`UPDATE fnb_close_batch_summaries
          SET cash_drops_cents = ${cashDropsCents},
              cash_paid_outs_cents = ${cashPaidOutsCents},
              updated_at = NOW()
          WHERE close_batch_id = ${input.closeBatchId}`,
    );

    // Update notes and move to reconciled
    const rows = await tx.execute(
      sql`UPDATE fnb_close_batches
          SET status = 'reconciled',
              reconciled_at = NOW(),
              reconciled_by = ${ctx.user.id},
              notes = COALESCE(${input.notes ?? null}, notes),
              updated_at = NOW()
          WHERE id = ${input.closeBatchId}
          RETURNING id, status, location_id, business_date, reconciled_at, reconciled_by`,
    );
    const updated = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    // Get cash over/short for the event
    const summaryRows = await tx.execute(
      sql`SELECT cash_over_short_cents FROM fnb_close_batch_summaries
          WHERE close_batch_id = ${input.closeBatchId}`,
    );
    const summary = Array.from(summaryRows as Iterable<Record<string, unknown>>)[0]!;

    const payload: CloseBatchReconciledPayload = {
      closeBatchId: input.closeBatchId,
      locationId: batch.location_id as string,
      businessDate: batch.business_date as string,
      reconciledBy: ctx.user.id,
      cashOverShortCents: summary.cash_over_short_cents as number | null,
    };
    const event = buildEventFromContext(ctx, FNB_EVENTS.CLOSE_BATCH_RECONCILED, payload as unknown as Record<string, unknown>);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'reconcileCloseBatch', updated);

    return { result: updated, events: [event] };
  });

  await auditLog(ctx, 'fnb.close_batch.reconciled', 'close_batch', input.closeBatchId);
  return result;
}
