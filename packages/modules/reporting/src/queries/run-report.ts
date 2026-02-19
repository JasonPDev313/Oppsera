import { withTenant, reportDefinitions, reportingFieldCatalog } from '@oppsera/db';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { NotFoundError } from '@oppsera/shared';
import { compileReport, resolveDatasets } from '../compiler';
import type { ReportFilter, ReportDefinitionBody, FieldCatalogEntry } from '../compiler';

export interface RunReportInput {
  tenantId: string;
  reportId: string;
  overrides?: {
    filters?: ReportFilter[];
  };
}

export interface RunReportResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export async function runReport(input: RunReportInput): Promise<RunReportResult> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Fetch report definition
    const [report] = await (tx as any).select().from(reportDefinitions)
      .where(and(
        eq(reportDefinitions.id, input.reportId),
        eq(reportDefinitions.tenantId, input.tenantId),
        eq(reportDefinitions.isArchived, false),
      ))
      .limit(1);

    if (!report) throw new NotFoundError('Report not found');

    const definition = report.definition as ReportDefinitionBody;

    // 2. Resolve effective datasets
    const datasets = resolveDatasets(report.dataset, definition);

    // 3. Fetch field catalog for all relevant datasets
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

    // 4. Merge runtime filter overrides (replace matching filters, don't just append)
    let finalFilters = definition.filters ?? [];
    if (input.overrides?.filters && input.overrides.filters.length > 0) {
      // Build a set of override keys using the bare fieldKey (without dataset prefix)
      // so 'daily_sales:business_date' and 'business_date' are treated as the same field
      const bareKey = (fk: string) => {
        const idx = fk.indexOf(':');
        return idx === -1 ? fk : fk.slice(idx + 1);
      };
      const overrideKeys = new Set(
        input.overrides.filters.map((f) => `${bareKey(f.fieldKey)}:${f.op}`),
      );
      // Remove saved filters that are being overridden (same bare fieldKey + op)
      finalFilters = finalFilters.filter(
        (f) => !overrideKeys.has(`${bareKey(f.fieldKey)}:${f.op}`),
      );
      finalFilters = [...finalFilters, ...input.overrides.filters];
    }

    const mergedDefinition: ReportDefinitionBody = {
      ...definition,
      filters: finalFilters,
    };

    // 5. Compile report into parameterized SQL
    const compiled = compileReport({
      tenantId: input.tenantId,
      dataset: report.dataset,
      definition: mergedDefinition,
      fieldCatalog,
    });

    // 6. Execute the compiled query using Drizzle's sql template
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
    // to match the SQL aliases the compiler now always produces
    const normalizedColumns = definition.columns.map((col) => {
      if (col.includes(':')) return col;
      return `${report.dataset}:${col}`;
    });

    return {
      columns: normalizedColumns,
      rows,
    };
  });
}
