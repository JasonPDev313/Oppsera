import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetPrintJobInput } from '../validation';

export interface PrintJobDetail {
  jobId: string;
  locationId: string;
  printerId: string;
  printJobType: string;
  stationId: string | null;
  ticketId: string | null;
  tabId: string | null;
  orderId: string | null;
  closeBatchId: string | null;
  terminalId: string | null;
  status: string;
  retryCount: number;
  receiptCopy: string | null;
  formattedContent: string | null;
  reprintOfJobId: string | null;
  reprintReason: string | null;
  errorReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export async function getPrintJob(
  input: GetPrintJobInput,
): Promise<PrintJobDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, location_id, printer_id, print_job_type, station_id, ticket_id, tab_id, order_id, close_batch_id, terminal_id, status, retry_count, receipt_copy, formatted_content, reprint_of_job_id, reprint_reason, error_reason, created_at, completed_at
          FROM fnb_print_jobs
          WHERE id = ${input.jobId}
            AND tenant_id = ${input.tenantId}`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) return null;

    const r = results[0]!;
    return {
      jobId: r.id as string,
      locationId: r.location_id as string,
      printerId: r.printer_id as string,
      printJobType: r.print_job_type as string,
      stationId: (r.station_id as string) ?? null,
      ticketId: (r.ticket_id as string) ?? null,
      tabId: (r.tab_id as string) ?? null,
      orderId: (r.order_id as string) ?? null,
      closeBatchId: (r.close_batch_id as string) ?? null,
      terminalId: (r.terminal_id as string) ?? null,
      status: r.status as string,
      retryCount: r.retry_count as number,
      receiptCopy: (r.receipt_copy as string) ?? null,
      formattedContent: (r.formatted_content as string) ?? null,
      reprintOfJobId: (r.reprint_of_job_id as string) ?? null,
      reprintReason: (r.reprint_reason as string) ?? null,
      errorReason: (r.error_reason as string) ?? null,
      createdAt: String(r.created_at),
      completedAt: r.completed_at ? String(r.completed_at) : null,
    };
  });
}
