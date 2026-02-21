import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import type { UpdatePrintJobStatusInput } from '../validation';
import { PrintJobNotFoundError } from '../errors';
import { FNB_EVENTS } from '../events/types';
import type { PrintJobCompletedPayload, PrintJobFailedPayload } from '../events/types';

export interface UpdatePrintJobStatusResult {
  jobId: string;
  status: string;
  retryCount: number;
}

export async function updatePrintJobStatus(
  ctx: RequestContext,
  input: UpdatePrintJobStatusInput,
): Promise<UpdatePrintJobStatusResult> {
  const errorReason = input.errorReason ?? null;

  const result = await publishWithOutbox(ctx, async (tx) => {
    const setClauses: ReturnType<typeof sql>[] = [
      sql`status = ${input.status}`,
    ];

    if (input.status === 'completed') {
      setClauses.push(sql`completed_at = NOW()`);
    }
    if (input.status === 'failed' && errorReason) {
      setClauses.push(sql`error_reason = ${errorReason}`);
      setClauses.push(sql`retry_count = retry_count + 1`);
    }

    const setClause = sql.join(setClauses, sql`, `);

    const rows = await tx.execute(
      sql`UPDATE fnb_print_jobs
          SET ${setClause}
          WHERE id = ${input.jobId}
            AND tenant_id = ${ctx.tenantId}
          RETURNING id, status, retry_count, printer_id, location_id, print_job_type`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) {
      throw new PrintJobNotFoundError(input.jobId);
    }

    const r = results[0]!;
    const statusResult: UpdatePrintJobStatusResult = {
      jobId: r.id as string,
      status: r.status as string,
      retryCount: r.retry_count as number,
    };

    const events = [];

    if (input.status === 'completed') {
      events.push(
        buildEventFromContext(ctx, FNB_EVENTS.PRINT_JOB_COMPLETED, {
          jobId: statusResult.jobId,
          locationId: r.location_id as string,
          printerId: r.printer_id as string,
          printJobType: r.print_job_type as string,
          retryCount: statusResult.retryCount,
        } satisfies PrintJobCompletedPayload),
      );
    } else if (input.status === 'failed') {
      events.push(
        buildEventFromContext(ctx, FNB_EVENTS.PRINT_JOB_FAILED, {
          jobId: statusResult.jobId,
          locationId: r.location_id as string,
          printerId: r.printer_id as string,
          printJobType: r.print_job_type as string,
          errorReason: errorReason ?? 'Unknown error',
          retryCount: statusResult.retryCount,
        } satisfies PrintJobFailedPayload),
      );
    }

    return { result: statusResult, events };
  });

  return result;
}
