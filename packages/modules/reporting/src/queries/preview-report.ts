import { withTenant, reportingFieldCatalog } from '@oppsera/db';
import { eq, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { compileReport, resolveDatasets } from '../compiler';
import type { ReportDefinitionBody, FieldCatalogEntry } from '../compiler';

export interface PreviewReportInput {
  tenantId: string;
  dataset: string;
  definition: ReportDefinitionBody;
}

export interface PreviewReportResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export async function previewReport(input: PreviewReportInput): Promise<PreviewReportResult> {
  return withTenant(input.tenantId, async (tx) => {
    const definition = input.definition;

    // 1. Resolve effective datasets
    const datasets = resolveDatasets(input.dataset, definition);

    // 2. Fetch field catalog for all relevant datasets
    const catalogRows = datasets.length === 1
      ? await (tx as any).select().from(reportingFieldCatalog)
          .where(eq(reportingFieldCatalog.dataset, datasets[0]!))
      : await (tx as any).select().from(reportingFieldCatalog)
          .where(inArray(reportingFieldCatalog.dataset, datasets));

    const fieldCatalog: FieldCatalogEntry[] = catalogRows.map((r: any) => ({
      id: r.id,
      dataset: r.dataset,
      fieldKey: r.fieldKey,
      label: r.label,
      dataType: r.dataType,
      aggregation: r.aggregation,
      isMetric: r.isMetric,
      isFilturable: r.isFilturable,
      isSortable: r.isSortable,
      columnExpression: r.columnExpression,
      tableRef: r.tableRef,
    }));

    // 3. Compile report into parameterized SQL
    const compiled = compileReport({
      tenantId: input.tenantId,
      dataset: input.dataset,
      definition,
      fieldCatalog,
    });

    // 4. Execute the compiled query using Drizzle's sql template
    const queryChunks: any[] = [];
    let lastIdx = 0;
    const paramRegex = /\$(\d+)/g;
    let match: RegExpExecArray | null;
    const queryStr = compiled.sql;
    while ((match = paramRegex.exec(queryStr)) !== null) {
      queryChunks.push(sql.raw(queryStr.slice(lastIdx, match.index)));
      queryChunks.push(sql`${compiled.params[parseInt(match[1]!, 10) - 1]}`);
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < queryStr.length) {
      queryChunks.push(sql.raw(queryStr.slice(lastIdx)));
    }
    const finalSql = sql.join(queryChunks, sql.raw(''));
    const rawResult = await (tx as any).execute(finalSql);

    const rows = Array.from(rawResult as Iterable<Record<string, unknown>>);

    // Normalize column keys to composite format (dataset:fieldKey)
    // to match the SQL aliases the compiler always produces
    const normalizedColumns = definition.columns.map((col) => {
      if (col.includes(':')) return col;
      return `${input.dataset}:${col}`;
    });

    return {
      columns: normalizedColumns,
      rows,
    };
  });
}
