/**
 * Create an import job: upload CSV, analyze, auto-map columns.
 */

import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  importJobs,
  importColumnMappings,
  importTenderMappings,
  importTaxMappings,
} from '@oppsera/db';

import type { CreateImportJobInput } from '../validation';
import { parseCsv } from '../services/csv-parser';
import { analyzeColumns } from '../services/analysis-engine';
import { autoMapColumns } from '../services/mapping-engine';
import { autoMapTenders } from '../services/tender-mapper';
import { detectTaxColumns, autoMapTaxColumns } from '../services/tax-mapper';
import { getColumnValues } from '../services/csv-parser';

export async function createImportJob(
  ctx: RequestContext,
  input: CreateImportJobInput,
) {
  // 1. Parse CSV
  const parsed = parseCsv(input.csvContent);

  // 2. Compute file hash for dedup
  const encoder = new TextEncoder();
  const data = encoder.encode(input.csvContent);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fileHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  // 3. Analyze columns
  const analysis = analyzeColumns(parsed);

  // 4. Auto-map columns
  const columnMaps = autoMapColumns(
    analysis.columns.map((c) => ({
      name: c.name,
      dataType: c.dataType,
      sampleValues: c.sampleValues,
    })),
  );

  // 5. Detect tender values
  const tenderMapping = columnMaps.find((m) => m.targetField === 'tenderType');
  const tenderValues = tenderMapping
    ? getColumnValues(parsed.rows, tenderMapping.sourceIndex)
    : [];
  const tenderSuggestions = tenderValues.length > 0 ? autoMapTenders(tenderValues) : [];

  // 6. Detect tax columns
  const taxColumns = detectTaxColumns(parsed.headers);
  const subtotalMapping = columnMaps.find((m) => m.targetField === 'subtotal');
  const taxSuggestions = taxColumns.length > 0
    ? autoMapTaxColumns(
        taxColumns,
        (idx) => getColumnValues(parsed.rows, idx),
        subtotalMapping?.sourceIndex,
      )
    : [];

  // 7. Create job + mappings in one transaction
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check for duplicate file hash
    const existing = await tx
      .select({ id: importJobs.id })
      .from(importJobs)
      .where(
        sql`${importJobs.tenantId} = ${ctx.tenantId}
          AND ${importJobs.fileHash} = ${fileHash}
          AND ${importJobs.status} NOT IN ('cancelled', 'failed')`,
      )
      .limit(1);

    if (existing.length > 0) {
      throw new Error(`A file with this content has already been imported (job ${existing[0]!.id})`);
    }

    // Insert job
    const [job] = await tx
      .insert(importJobs)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.locationId ?? null,
        name: input.name,
        status: 'mapping',
        mode: input.mode ?? 'operational',
        fileName: input.fileName,
        fileSizeBytes: input.fileSizeBytes,
        fileHash,
        rowCount: parsed.rowCount,
        sourceSystem: input.sourceSystem ?? null,
        detectedColumns: analysis.columns,
        detectedStructure: analysis.detectedStructure,
        groupingKey: analysis.suggestedGroupingKey,
        totalRows: parsed.rowCount,
        importedBy: ctx.user.id,
      })
      .returning();

    const jobId = job!.id;

    // Insert column mappings
    if (columnMaps.length > 0) {
      await tx.insert(importColumnMappings).values(
        columnMaps.map((m) => ({
          tenantId: ctx.tenantId,
          importJobId: jobId,
          sourceColumn: m.sourceColumn,
          targetEntity: m.targetEntity,
          targetField: m.targetField || 'unmapped',
          confidence: String(m.confidence),
          confidenceReason: m.confidenceReason,
          isConfirmed: m.confidence >= 0.90,
          dataType: m.dataType,
          transformRule: m.transformRule,
          sampleValues: m.sampleValues,
        })),
      );
    }

    // Insert tender mappings
    if (tenderSuggestions.length > 0) {
      await tx.insert(importTenderMappings).values(
        tenderSuggestions.map((s) => ({
          tenantId: ctx.tenantId,
          importJobId: jobId,
          legacyValue: s.legacyValue,
          oppseraTenderType: s.oppseraTenderType,
          confidence: String(s.confidence),
          isConfirmed: s.confidence >= 0.85,
          occurrenceCount: s.occurrenceCount,
        })),
      );
    }

    // Insert tax mappings
    if (taxSuggestions.length > 0) {
      await tx.insert(importTaxMappings).values(
        taxSuggestions.map((s) => ({
          tenantId: ctx.tenantId,
          importJobId: jobId,
          legacyColumn: s.legacyColumn,
          legacyRate: s.legacyRate !== null ? String(s.legacyRate) : null,
          taxMode: s.taxMode,
          confidence: String(s.confidence),
          isConfirmed: false,
        })),
      );
    }

    const event = buildEventFromContext(
      ctx,
      'import.job.created.v1',
      { importJobId: jobId, fileName: input.fileName, rowCount: parsed.rowCount },
    );

    return { result: job!, events: [event] };
  });

  await auditLog(ctx, 'import.job.created', 'import_job', result.id);
  return result;
}
