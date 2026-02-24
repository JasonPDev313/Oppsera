/**
 * Get live import progress (for polling during background import).
 */

import { eq, and } from 'drizzle-orm';
import { withTenant, importJobs } from '@oppsera/db';

import type { GetImportProgressInput } from '../validation';

export async function getImportProgress(input: GetImportProgressInput) {
  return withTenant(input.tenantId, async (tx) => {
    const [job] = await tx
      .select({
        id: importJobs.id,
        status: importJobs.status,
        totalRows: importJobs.totalRows,
        processedRows: importJobs.processedRows,
        importedRows: importJobs.importedRows,
        skippedRows: importJobs.skippedRows,
        errorRows: importJobs.errorRows,
        quarantinedRows: importJobs.quarantinedRows,
        startedAt: importJobs.startedAt,
        completedAt: importJobs.completedAt,
      })
      .from(importJobs)
      .where(
        and(
          eq(importJobs.id, input.importJobId),
          eq(importJobs.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!job) return null;

    const percentage = job.totalRows > 0
      ? Math.round((job.processedRows / job.totalRows) * 100)
      : 0;

    const elapsedMs = job.startedAt
      ? (job.completedAt ?? new Date()).getTime() - job.startedAt.getTime()
      : 0;

    return {
      ...job,
      percentage,
      elapsedMs,
      isComplete: job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled',
    };
  });
}
