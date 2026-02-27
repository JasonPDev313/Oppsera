import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import {
  CloseBatchNotFoundError,
  CloseBatchStatusConflictError,
  BatchAlreadyPostedError,
} from '../errors';
import { FNB_EVENTS } from '../events/types';
import type { GlPostingCreatedPayload } from '../events/types';
import { buildBatchJournalLines } from '../helpers/build-batch-journal-lines';

interface PostBatchToGlInput {
  closeBatchId: string;
  clientRequestId?: string;
}

export async function postBatchToGl(ctx: RequestContext, input: PostBatchToGlInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'postBatchToGl');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Validate close batch exists and is reconciled
    const batchRows = await tx.execute(
      sql`SELECT b.id, b.status, b.location_id, b.business_date, b.gl_journal_entry_id
          FROM fnb_close_batches b
          WHERE b.id = ${input.closeBatchId} AND b.tenant_id = ${ctx.tenantId}`,
    );
    const batches = Array.from(batchRows as Iterable<Record<string, unknown>>);
    if (batches.length === 0) throw new CloseBatchNotFoundError(input.closeBatchId);

    const batch = batches[0]!;
    if (batch.gl_journal_entry_id) {
      throw new BatchAlreadyPostedError(input.closeBatchId);
    }
    if (batch.status !== 'reconciled') {
      throw new CloseBatchStatusConflictError(input.closeBatchId, batch.status as string, 'reconciled');
    }

    // Get batch summary for building journal lines
    const summaryRows = await tx.execute(
      sql`SELECT * FROM fnb_close_batch_summaries WHERE close_batch_id = ${input.closeBatchId}`,
    );
    const summaries = Array.from(summaryRows as Iterable<Record<string, unknown>>);
    if (summaries.length === 0) throw new CloseBatchNotFoundError(input.closeBatchId);

    const summary = summaries[0]!;

    // Aggregate revenue by sub-department from tab items (if not already on summary)
    if (!summary.sales_by_sub_department) {
      const subDeptRows = await tx.execute(
        sql`SELECT fti.sub_department_id,
                   COALESCE(MIN(cc.name), 'Uncategorized') AS sub_department_name,
                   SUM(fti.extended_price_cents) AS net_sales_cents
            FROM fnb_tab_items fti
            JOIN fnb_tabs ft ON fti.tab_id = ft.id
            LEFT JOIN catalog_categories cc ON cc.id = fti.sub_department_id
            WHERE ft.tenant_id = ${ctx.tenantId}
              AND ft.location_id = ${batch.location_id as string}
              AND ft.business_date = ${batch.business_date as string}
              AND ft.status = 'closed'
              AND fti.status != 'voided'
              AND fti.sub_department_id IS NOT NULL
            GROUP BY fti.sub_department_id`,
      );
      const subDeptSales = Array.from(subDeptRows as Iterable<Record<string, unknown>>).map((r) => ({
        subDepartmentId: r.sub_department_id as string,
        subDepartmentName: r.sub_department_name as string,
        netSalesCents: Number(r.net_sales_cents),
      }));

      if (subDeptSales.length > 0) {
        summary.sales_by_sub_department = subDeptSales;

        // Persist to the summary for Z-report display
        await tx.execute(
          sql`UPDATE fnb_close_batch_summaries
              SET sales_by_sub_department = ${JSON.stringify(subDeptSales)}::jsonb,
                  updated_at = NOW()
              WHERE close_batch_id = ${input.closeBatchId}`,
        );
      }
    }

    // Build journal lines from summary data
    const journalLines = buildBatchJournalLines(summary);

    // Calculate totals for the event
    let totalDebitCents = 0;
    let totalCreditCents = 0;
    for (const line of journalLines) {
      totalDebitCents += line.debitCents;
      totalCreditCents += line.creditCents;
    }

    // Record posting attempt — actual GL posting happens via accounting module
    // Store a posting reference ID for the AccountingPostingApi to use
    const postingRefId = `fnb-batch-${input.closeBatchId}`;

    // Update batch status to posted
    await tx.execute(
      sql`UPDATE fnb_close_batches
          SET status = 'posted',
              posted_at = NOW(),
              posted_by = ${ctx.user.id},
              gl_journal_entry_id = ${postingRefId},
              updated_at = NOW()
          WHERE id = ${input.closeBatchId}`,
    );

    const payload: GlPostingCreatedPayload = {
      closeBatchId: input.closeBatchId,
      locationId: batch.location_id as string,
      businessDate: batch.business_date as string,
      glJournalEntryId: postingRefId,
      totalDebitCents,
      totalCreditCents,
      lineCount: journalLines.length,
      journalLines: journalLines.map(jl => ({
        category: jl.category,
        description: jl.description,
        debitCents: jl.debitCents,
        creditCents: jl.creditCents,
        subDepartmentId: jl.subDepartmentId ?? null,
      })),
    };
    const event = buildEventFromContext(ctx, FNB_EVENTS.GL_POSTING_CREATED, payload as unknown as Record<string, unknown>);

    const resultPayload = {
      closeBatchId: input.closeBatchId,
      postingRefId,
      totalDebitCents,
      totalCreditCents,
      lineCount: journalLines.length,
      journalLines,
    };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'postBatchToGl', resultPayload);

    return {
      result: {
        closeBatchId: input.closeBatchId,
        postingRefId,
        totalDebitCents,
        totalCreditCents,
        lineCount: journalLines.length,
        journalLines,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'fnb.gl_posting.created', 'close_batch', input.closeBatchId);
  return result;
}
