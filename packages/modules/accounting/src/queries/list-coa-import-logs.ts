import { eq, desc } from 'drizzle-orm';
import { withTenant, glCoaImportLogs } from '@oppsera/db';

export interface CoaImportLogItem {
  id: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  status: string;
  importedBy: string | null;
  startedAt: Date;
  completedAt: Date | null;
  errors: unknown;
}

export async function listCoaImportLogs(input: {
  tenantId: string;
  limit?: number;
}): Promise<CoaImportLogItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(glCoaImportLogs)
      .where(eq(glCoaImportLogs.tenantId, input.tenantId))
      .orderBy(desc(glCoaImportLogs.startedAt))
      .limit(input.limit ?? 50);

    return rows.map((l) => ({
      id: l.id,
      fileName: l.fileName,
      totalRows: l.totalRows,
      successRows: l.successRows,
      errorRows: l.errorRows,
      status: l.status,
      importedBy: l.importedBy,
      startedAt: l.startedAt,
      completedAt: l.completedAt,
      errors: l.errors,
    }));
  });
}
