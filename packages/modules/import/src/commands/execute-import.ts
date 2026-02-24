/**
 * Execute import: process staged rows into OppsEra orders and tenders.
 *
 * This command reads from import_staged_rows, processes them through the
 * import processor, and then calls the existing order/tender command layer.
 * The actual order creation is done via OrdersWriteApi for cross-module safety.
 */

import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  importJobs,
  importTenderMappings,
  importItemMappings,
  importStagedRows,
  importErrors,
} from '@oppsera/db';

import type { ExecuteImportInput } from '../validation';
import { processStagedsRows } from '../services/import-processor';

export async function executeImport(
  ctx: RequestContext,
  input: ExecuteImportInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load job
    const [job] = await tx
      .select()
      .from(importJobs)
      .where(
        and(
          eq(importJobs.id, input.importJobId),
          eq(importJobs.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!job) throw new Error(`Import job ${input.importJobId} not found`);
    if (job.status !== 'validating' && job.status !== 'ready') {
      throw new Error(`Cannot execute import for job in "${job.status}" status`);
    }

    // Load tender mappings as lookup
    const tenderMaps = await tx
      .select()
      .from(importTenderMappings)
      .where(eq(importTenderMappings.importJobId, input.importJobId));
    const tenderLookup = new Map<string, string>();
    for (const tm of tenderMaps) {
      tenderLookup.set(tm.legacyValue, tm.oppseraTenderType);
    }

    // Load item mappings as lookup
    const itemMaps = await tx
      .select()
      .from(importItemMappings)
      .where(eq(importItemMappings.importJobId, input.importJobId));
    const itemLookup = new Map<string, { catalogItemId: string | null; strategy: string }>();
    for (const im of itemMaps) {
      itemLookup.set(im.legacyItemName.toLowerCase(), {
        catalogItemId: im.oppseraCatalogItemId,
        strategy: im.strategy,
      });
    }

    // Load staged rows
    const stagedRows = await tx
      .select()
      .from(importStagedRows)
      .where(
        and(
          eq(importStagedRows.importJobId, input.importJobId),
          eq(importStagedRows.status, 'pending'),
        ),
      );

    // Process staged rows
    const processed = processStagedsRows(
      stagedRows.map((r) => ({
        rowNumber: r.rowNumber,
        groupKey: r.groupKey,
        entityType: r.entityType as 'order_header' | 'order_line' | 'tender',
        parsedData: (r.parsedData ?? {}) as Record<string, unknown>,
      })),
      input.importJobId,
      tenderLookup,
      itemLookup,
    );

    // Log processing errors
    if (processed.errors.length > 0) {
      const errorBatch = processed.errors.slice(0, 1000); // cap at 1000 errors
      await tx.insert(importErrors).values(
        errorBatch.map((e) => ({
          tenantId: ctx.tenantId,
          importJobId: input.importJobId,
          rowNumber: e.rowNumber,
          severity: e.severity,
          category: e.category,
          message: e.message,
        })),
      );
    }

    // Update job status to importing
    await tx
      .update(importJobs)
      .set({
        status: 'importing',
        startedAt: new Date(),
        totalRows: processed.orders.length,
        processedRows: 0,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, input.importJobId));

    // Mark business date range
    const dates = processed.orders
      .map((o) => o.businessDate)
      .filter((d): d is string => d !== null)
      .sort();

    if (dates.length > 0) {
      await tx
        .update(importJobs)
        .set({
          businessDateFrom: dates[0],
          businessDateTo: dates[dates.length - 1],
        })
        .where(eq(importJobs.id, input.importJobId));
    }

    const event = buildEventFromContext(ctx, 'import.job.execution_started.v1', {
      importJobId: input.importJobId,
      orderCount: processed.orders.length,
      mode: job.mode,
    });

    return {
      result: {
        importJobId: input.importJobId,
        orderCount: processed.orders.length,
        errorCount: processed.errors.length,
        orders: processed.orders,
        status: 'importing',
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'import.job.execution_started', 'import_job', input.importJobId);
  return result;
}
