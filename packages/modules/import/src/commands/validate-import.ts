/**
 * Validate import: run validation checks, stage rows, compute reconciliation.
 */

import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  importJobs,
  importColumnMappings,
  importErrors,
  importStagedRows,
} from '@oppsera/db';

import type { ValidateImportInput } from '../validation';
import { groupRowsIntoOrders } from '../services/grouping-engine';
import { stageOrders } from '../services/staging-engine';
import { computeReconciliation } from '../services/reconciliation-engine';

export async function validateImport(
  ctx: RequestContext,
  input: ValidateImportInput,
  csvContent: string,
) {
  // Lazy import to avoid circular dependency at module init time
  const { parseCsv } = await import('../services/csv-parser');

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
    if (job.status !== 'mapping' && job.status !== 'validating') {
      throw new Error(`Cannot validate job in "${job.status}" status`);
    }

    // Load column mappings
    const colMappings = await tx
      .select()
      .from(importColumnMappings)
      .where(eq(importColumnMappings.importJobId, input.importJobId));

    // Parse CSV (need re-parse since we don't store raw content)
    const parsed = parseCsv(csvContent);

    // Find grouping key index
    const groupingKeyMapping = colMappings.find((m) => m.targetField === 'groupingKey');
    const groupingKeyIndex = groupingKeyMapping
      ? parsed.headers.findIndex((h) => h === groupingKeyMapping.sourceColumn)
      : -1;

    // Build mapping structures
    const mappingsForGrouping = colMappings
      .filter((m) => m.targetEntity !== 'ignore')
      .map((m) => ({
        sourceColumn: m.sourceColumn,
        sourceIndex: parsed.headers.indexOf(m.sourceColumn),
        targetEntity: m.targetEntity as 'order' | 'line' | 'tender' | 'tax' | 'ignore',
        targetField: m.targetField,
        confidence: Number(m.confidence),
        confidenceReason: m.confidenceReason ?? '',
        dataType: m.dataType ?? 'string',
        transformRule: (m.transformRule ?? 'none') as 'none' | 'cents_to_dollars' | 'dollars_to_cents' | 'date_parse' | 'lookup',
        sampleValues: (m.sampleValues ?? []) as string[],
      }));

    // Group rows into orders
    const orders = groupRowsIntoOrders(parsed.rows, mappingsForGrouping, groupingKeyIndex);

    // Build transform map for staging
    const fieldTransforms = new Map<string, { targetField: string; transformRule: string }>();
    for (const m of colMappings) {
      if (m.targetEntity !== 'ignore' && m.targetField) {
        fieldTransforms.set(m.targetField, {
          targetField: m.targetField,
          transformRule: m.transformRule ?? 'none',
        });
      }
    }

    // Stage orders
    const stagingResult = stageOrders(orders, fieldTransforms);

    // Clear old staged rows and errors
    await tx
      .delete(importStagedRows)
      .where(eq(importStagedRows.importJobId, input.importJobId));
    await tx
      .delete(importErrors)
      .where(eq(importErrors.importJobId, input.importJobId));

    // Insert staged rows in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < stagingResult.stagedRows.length; i += BATCH_SIZE) {
      const batch = stagingResult.stagedRows.slice(i, i + BATCH_SIZE);
      await tx.insert(importStagedRows).values(
        batch.map((row) => ({
          tenantId: ctx.tenantId,
          importJobId: input.importJobId,
          rowNumber: row.rowNumber,
          groupKey: row.groupKey,
          entityType: row.entityType,
          parsedData: row.parsedData,
          status: 'pending',
        })),
      );
    }

    // Compute reconciliation
    const reconciliation = computeReconciliation(stagingResult.stagedRows, parsed.rowCount);

    // Insert errors from staging
    if (stagingResult.errors.length > 0) {
      await tx.insert(importErrors).values(
        stagingResult.errors.map((e) => ({
          tenantId: ctx.tenantId,
          importJobId: input.importJobId,
          rowNumber: e.rowNumber,
          severity: e.severity,
          category: e.category,
          message: e.message,
          sourceData: e.sourceData ?? null,
        })),
      );
    }

    // Update job with reconciliation totals
    await tx
      .update(importJobs)
      .set({
        status: 'validating',
        legacyRevenueCents: reconciliation.legacyRevenueCents,
        legacyPaymentCents: reconciliation.legacyPaymentCents,
        legacyTaxCents: reconciliation.legacyTaxCents,
        legacyRowCount: reconciliation.legacyRowCount,
        oppseraRevenueCents: reconciliation.oppseraRevenueCents,
        oppseraPaymentCents: reconciliation.oppseraPaymentCents,
        oppseraTaxCents: reconciliation.oppseraTaxCents,
        oppseraOrderCount: reconciliation.oppseraOrderCount,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, input.importJobId));

    const event = buildEventFromContext(ctx, 'import.job.validated.v1', {
      importJobId: input.importJobId,
      orderCount: reconciliation.oppseraOrderCount,
      isBalanced: reconciliation.isBalanced,
    });

    return {
      result: {
        ...reconciliation,
        stagedRowCount: stagingResult.stagedRows.length,
        errorCount: stagingResult.errors.length,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'import.job.validated', 'import_job', input.importJobId);
  return result;
}
