import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListPrintJobsInput } from '../validation';

export interface PrintJobListItem {
  jobId: string;
  locationId: string;
  printerId: string;
  printJobType: string;
  stationId: string | null;
  ticketId: string | null;
  tabId: string | null;
  status: string;
  retryCount: number;
  receiptCopy: string | null;
  reprintOfJobId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export async function listPrintJobs(
  input: ListPrintJobsInput,
): Promise<{ items: PrintJobListItem[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`location_id = ${input.locationId}`,
    ];

    if (input.printerId) {
      conditions.push(sql`printer_id = ${input.printerId}`);
    }
    if (input.status) {
      conditions.push(sql`status = ${input.status}`);
    }
    if (input.printJobType) {
      conditions.push(sql`print_job_type = ${input.printJobType}`);
    }
    if (input.cursor) {
      conditions.push(sql`id < ${input.cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, location_id, printer_id, print_job_type, station_id, ticket_id, tab_id, status, retry_count, receipt_copy, reprint_of_job_id, created_at, completed_at
          FROM fnb_print_jobs
          WHERE ${whereClause}
          ORDER BY id DESC
          LIMIT ${limit + 1}`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = results.length > limit;
    const items = (hasMore ? results.slice(0, limit) : results).map((r) => ({
      jobId: r.id as string,
      locationId: r.location_id as string,
      printerId: r.printer_id as string,
      printJobType: r.print_job_type as string,
      stationId: (r.station_id as string) ?? null,
      ticketId: (r.ticket_id as string) ?? null,
      tabId: (r.tab_id as string) ?? null,
      status: r.status as string,
      retryCount: r.retry_count as number,
      receiptCopy: (r.receipt_copy as string) ?? null,
      reprintOfJobId: (r.reprint_of_job_id as string) ?? null,
      createdAt: String(r.created_at),
      completedAt: r.completed_at ? String(r.completed_at) : null,
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.jobId : null,
      hasMore,
    };
  });
}
