import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { generateUlid } from '@oppsera/shared';
import type { CreatePrintJobInput } from '../validation';
import { NoPrinterRoutedError } from '../errors';
import { resolveRoutedPrinter } from '../helpers/printer-routing';
import type { RoutingRule } from '../helpers/printer-routing';
import { FNB_EVENTS } from '../events/types';
import type { PrintJobCreatedPayload } from '../events/types';

export interface CreatePrintJobResult {
  jobId: string;
  printerId: string;
  printJobType: string;
  status: string;
}

export async function createPrintJob(
  ctx: RequestContext,
  input: CreatePrintJobInput,
): Promise<CreatePrintJobResult> {
  const jobId = generateUlid();

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Determine printer via routing logic
    let printerId = input.printerId ?? null;

    if (!printerId) {
      // Fetch routing rules for this location + job type
      const ruleRows = await tx.execute(
        sql`SELECT id, station_id, printer_id, print_job_type, priority, is_active
            FROM fnb_print_routing_rules
            WHERE tenant_id = ${ctx.tenantId}
              AND location_id = ${input.locationId}
              AND is_active = true`,
      );

      const rules: RoutingRule[] = Array.from(
        ruleRows as Iterable<Record<string, unknown>>,
      ).map((r) => ({
        id: r.id as string,
        stationId: (r.station_id as string) ?? null,
        printerId: r.printer_id as string,
        printJobType: r.print_job_type as string,
        priority: r.priority as number,
        isActive: r.is_active as boolean,
      }));

      printerId = resolveRoutedPrinter(rules, {
        printJobType: input.printJobType,
        locationId: input.locationId,
        stationId: input.stationId,
        terminalReceiptPrinterId: undefined, // terminal printer resolved at API layer
      });
    }

    if (!printerId) {
      throw new NoPrinterRoutedError(input.printJobType, input.locationId);
    }

    const stationId = input.stationId ?? null;
    const ticketId = input.ticketId ?? null;
    const tabId = input.tabId ?? null;
    const orderId = input.orderId ?? null;
    const closeBatchId = input.closeBatchId ?? null;
    const terminalId = input.terminalId ?? null;
    const receiptCopy = input.receiptCopy ?? null;
    const formattedContent = input.formattedContent ?? null;

    const rows = await tx.execute(
      sql`INSERT INTO fnb_print_jobs (id, tenant_id, location_id, printer_id, print_job_type, station_id, ticket_id, tab_id, order_id, close_batch_id, terminal_id, receipt_copy, formatted_content, status, retry_count, created_at)
          VALUES (${jobId}, ${ctx.tenantId}, ${input.locationId}, ${printerId}, ${input.printJobType}, ${stationId}, ${ticketId}, ${tabId}, ${orderId}, ${closeBatchId}, ${terminalId}, ${receiptCopy}, ${formattedContent}, 'queued', 0, NOW())
          RETURNING id, printer_id, print_job_type, status`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    const r = results[0]!;

    const jobResult: CreatePrintJobResult = {
      jobId: r.id as string,
      printerId: r.printer_id as string,
      printJobType: r.print_job_type as string,
      status: r.status as string,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.PRINT_JOB_CREATED, {
      jobId: jobResult.jobId,
      locationId: input.locationId,
      printJobType: jobResult.printJobType,
      printerId: jobResult.printerId,
      stationId,
      ticketId,
      tabId,
    } satisfies PrintJobCreatedPayload);

    return { result: jobResult, events: [event] };
  });

  return result;
}
