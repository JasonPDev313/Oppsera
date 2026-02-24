/**
 * Query import history for a tenant.
 */

import { withTenant, customerImportLogs } from '@oppsera/db';
import { desc, and, eq, sql } from 'drizzle-orm';

interface ListImportLogsInput {
  tenantId: string;
  cursor?: string;
  limit?: number;
}

export interface ImportLogSummary {
  id: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  updatedRows: number;
  skippedRows: number;
  errorRows: number;
  status: string;
  importedBy: string | null;
  startedAt: string;
  completedAt: string | null;
}

export async function listCustomerImportLogs(
  input: ListImportLogsInput,
): Promise<{ items: ImportLogSummary[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 20;

  return withTenant(input.tenantId, async (tx: any) => {
    const conditions = [eq(customerImportLogs.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(sql`${customerImportLogs.id} < ${input.cursor}`);
    }

    const rows = await tx
      .select({
        id: customerImportLogs.id,
        fileName: customerImportLogs.fileName,
        totalRows: customerImportLogs.totalRows,
        successRows: customerImportLogs.successRows,
        updatedRows: customerImportLogs.updatedRows,
        skippedRows: customerImportLogs.skippedRows,
        errorRows: customerImportLogs.errorRows,
        status: customerImportLogs.status,
        importedBy: customerImportLogs.importedBy,
        startedAt: customerImportLogs.startedAt,
        completedAt: customerImportLogs.completedAt,
      })
      .from(customerImportLogs)
      .where(and(...conditions))
      .orderBy(desc(customerImportLogs.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((row: any) => ({
        id: row.id,
        fileName: row.fileName,
        totalRows: row.totalRows,
        successRows: row.successRows,
        updatedRows: row.updatedRows,
        skippedRows: row.skippedRows,
        errorRows: row.errorRows,
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
