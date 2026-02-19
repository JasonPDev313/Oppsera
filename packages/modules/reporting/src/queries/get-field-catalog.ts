import { eq, inArray } from 'drizzle-orm';
import { db, reportingFieldCatalog } from '@oppsera/db';

export interface FieldCatalogRow {
  id: string;
  dataset: string;
  fieldKey: string;
  label: string;
  dataType: string;
  aggregation: string | null;
  isMetric: boolean;
  isFilterable: boolean;
  isSortable: boolean;
  columnExpression: string;
  tableRef: string;
}

export async function getFieldCatalog(dataset?: string | string[]): Promise<FieldCatalogRow[]> {
  // System table — no tenant scoping needed
  if (dataset) {
    if (Array.isArray(dataset)) {
      const rows = await db.select().from(reportingFieldCatalog)
        .where(inArray(reportingFieldCatalog.dataset, dataset));
      return rows.map(mapRow);
    }
    const rows = await db.select().from(reportingFieldCatalog)
      .where(eq(reportingFieldCatalog.dataset, dataset));
    return rows.map(mapRow);
  }
  const rows = await db.select().from(reportingFieldCatalog);
  return rows.map(mapRow);
}

function mapRow(r: typeof reportingFieldCatalog.$inferSelect): FieldCatalogRow {
  return {
    id: r.id,
    dataset: r.dataset,
    fieldKey: r.fieldKey,
    label: r.label,
    dataType: r.dataType,
    aggregation: r.aggregation,
    isMetric: r.isMetric,
    isFilterable: r.isFilturable,
    isSortable: r.isSortable,
    columnExpression: r.columnExpression,
    tableRef: r.tableRef,
  };
}
