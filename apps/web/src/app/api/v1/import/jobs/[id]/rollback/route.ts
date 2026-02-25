/**
 * POST /api/v1/import/jobs/:id/rollback
 *
 * Rolls back a completed generic import job by deleting all orders
 * created by the job and resetting the job status.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, importJobs } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';

function extractJobId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

async function handler(req: NextRequest, ctx: RequestContext) {
  const jobId = extractJobId(req);

  if (!jobId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'jobId is required' } },
      { status: 400 },
    );
  }

  try {
    await withTenant(ctx.tenantId, async (tx) => {
      // Verify the job belongs to this tenant
      const [job] = await tx
        .select({ id: importJobs.id, status: importJobs.status })
        .from(importJobs)
        .where(sql`${importJobs.id} = ${jobId} AND ${importJobs.tenantId} = ${ctx.tenantId}`)
        .limit(1);

      if (!job) {
        throw new Error('Import job not found');
      }

      if (job.status === 'rolled_back') {
        throw new Error('Import has already been rolled back');
      }

      // Delete orders created by this import job.
      // Orders reference the import via metadata.importJobId.
      // First delete related records, then the orders themselves.
      await tx.execute(
        sql`DELETE FROM order_line_taxes WHERE tenant_id = ${ctx.tenantId} AND order_line_id IN (
          SELECT ol.id FROM order_lines ol
          JOIN orders o ON o.id = ol.order_id AND o.tenant_id = ol.tenant_id
          WHERE o.tenant_id = ${ctx.tenantId} AND o.metadata->>'importJobId' = ${jobId}
        )`
      );
      await tx.execute(
        sql`DELETE FROM order_lines WHERE tenant_id = ${ctx.tenantId} AND order_id IN (
          SELECT id FROM orders WHERE tenant_id = ${ctx.tenantId} AND metadata->>'importJobId' = ${jobId}
        )`
      );
      await tx.execute(
        sql`DELETE FROM tenders WHERE tenant_id = ${ctx.tenantId} AND order_id IN (
          SELECT id FROM orders WHERE tenant_id = ${ctx.tenantId} AND metadata->>'importJobId' = ${jobId}
        )`
      );
      await tx.execute(
        sql`DELETE FROM orders WHERE tenant_id = ${ctx.tenantId} AND metadata->>'importJobId' = ${jobId}`
      );

      // Reset staged rows to allow re-import
      await tx.execute(
        sql`UPDATE import_staged_rows SET status = 'pending' WHERE import_job_id = ${jobId} AND status = 'imported'`
      );

      // Mark job as rolled back
      await tx.update(importJobs).set({
        status: 'rolled_back',
      }).where(sql`id = ${jobId}`);
    });

    return NextResponse.json({ data: { success: true, jobId } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Rollback failed';
    return NextResponse.json(
      { error: { code: 'ROLLBACK_ERROR', message } },
      { status: 500 },
    );
  }
}

export const POST = withMiddleware(handler, {
  entitlement: 'legacy_import',
  permission: 'import.manage',
  writeAccess: true,
});
