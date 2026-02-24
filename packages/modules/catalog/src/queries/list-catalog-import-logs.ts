/**
 * List catalog import history for a tenant with cursor pagination.
 */

import { withTenant, catalogImportLogs } from '@oppsera/db';
import { desc, and, eq, sql } from 'drizzle-orm';

interface ListCatalogImportLogsInput {
  tenantId: string;
  cursor?: string;
  limit?: number;
}

export interface CatalogImportLogSummary {
  id: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  skippedRows: number;
  updatedRows: number;
  status: string;
  importedBy: string | null;
  startedAt: string;
  completedAt: string | null;
}

export async function listCatalogImportLogs(
  input: ListCatalogImportLogsInput,
): Promise<{ items: CatalogImportLogSummary[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 20;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(catalogImportLogs.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(sql`${catalogImportLogs.id} < ${input.cursor}`);
    }

    const rows = await tx
      .select({
        id: catalogImportLogs.id,
        fileName: catalogImportLogs.fileName,
        totalRows: catalogImportLogs.totalRows,
        successRows: catalogImportLogs.successRows,
        errorRows: catalogImportLogs.errorRows,
        skippedRows: catalogImportLogs.skippedRows,
        updatedRows: catalogImportLogs.updatedRows,
        status: catalogImportLogs.status,
        importedBy: catalogImportLogs.importedBy,
        startedAt: catalogImportLogs.startedAt,
        completedAt: catalogImportLogs.completedAt,
      })
      .from(catalogImportLogs)
      .where(and(...conditions))
      .orderBy(desc(catalogImportLogs.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((row: any) => ({
        id: row.id,
        fileName: row.fileName,
        totalRows: row.totalRows,
        successRows: row.successRows,
        errorRows: row.errorRows,
        skippedRows: row.skippedRows,
        updatedRows: row.updatedRows,
        status: row.status,
        importedBy: row.importedBy,
        startedAt: row.startedAt?.toISOString() ?? '',
        completedAt: row.completedAt?.toISOString() ?? null,
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
