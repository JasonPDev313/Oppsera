import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { generateUlid } from '@oppsera/shared';
import type { ReprintJobInput } from '../validation';
import { PrintJobNotFoundError } from '../errors';
import { FNB_EVENTS } from '../events/types';
import type { PrintJobReprintedPayload } from '../events/types';

export interface ReprintJobResult {
  reprintJobId: string;
  originalJobId: string;
  printerId: string;
  status: string;
}

export async function reprintJob(
  ctx: RequestContext,
  input: ReprintJobInput,
): Promise<ReprintJobResult> {
  const reprintJobId = generateUlid();
  const reason = input.reason ?? null;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch original job
    const origRows = await tx.execute(
      sql`SELECT id, location_id, printer_id, print_job_type, station_id, ticket_id, tab_id, order_id, close_batch_id, terminal_id, receipt_copy, formatted_content
          FROM fnb_print_jobs
          WHERE id = ${input.jobId}
            AND tenant_id = ${ctx.tenantId}`,
    );

    const origResults = Array.from(origRows as Iterable<Record<string, unknown>>);
    if (origResults.length === 0) {
      throw new PrintJobNotFoundError(input.jobId);
    }

    const orig = origResults[0]!;

    // Create reprint job as a copy of the original
    await tx.execute(
      sql`INSERT INTO fnb_print_jobs (id, tenant_id, location_id, printer_id, print_job_type, station_id, ticket_id, tab_id, order_id, close_batch_id, terminal_id, receipt_copy, formatted_content, status, retry_count, reprint_of_job_id, reprint_reason, created_at)
          VALUES (${reprintJobId}, ${ctx.tenantId}, ${orig.location_id}, ${orig.printer_id}, ${orig.print_job_type}, ${orig.station_id}, ${orig.ticket_id}, ${orig.tab_id}, ${orig.order_id}, ${orig.close_batch_id}, ${orig.terminal_id}, ${orig.receipt_copy}, ${orig.formatted_content}, 'queued', 0, ${input.jobId}, ${reason}, NOW())`,
    );

    const reprintResult: ReprintJobResult = {
      reprintJobId,
      originalJobId: input.jobId,
      printerId: orig.printer_id as string,
      status: 'queued',
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.PRINT_JOB_REPRINTED, {
      originalJobId: input.jobId,
      reprintJobId,
      locationId: orig.location_id as string,
      printJobType: orig.print_job_type as string,
      userId: ctx.user.id,
      reason,
    } satisfies PrintJobReprintedPayload);

    return { result: reprintResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.print_job.reprinted', 'fnb_print_job', result.reprintJobId);
  return result;
}
