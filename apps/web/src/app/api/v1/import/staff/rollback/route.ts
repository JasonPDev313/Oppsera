/**
 * POST /api/v1/import/staff/rollback
 *
 * Rolls back a completed staff import by deleting all users that were created
 * by the import job. Updated users are NOT reverted (too complex to restore
 * previous state safely). Only newly created users are deleted.
 *
 * Expects: { jobId: string, createdUserIds?: string[] }
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, staffImportJobs } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';

async function handler(req: NextRequest, ctx: RequestContext) {
  const body = await req.json();
  const { jobId, createdUserIds } = body as {
    jobId: string;
    createdUserIds?: string[];
  };

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
        .select({ id: staffImportJobs.id, status: staffImportJobs.status })
        .from(staffImportJobs)
        .where(sql`${staffImportJobs.id} = ${jobId} AND ${staffImportJobs.tenantId} = ${ctx.tenantId}`)
        .limit(1);

      if (!job) {
        throw new Error('Import job not found');
      }

      if (job.status === 'rolled_back') {
        throw new Error('Import has already been rolled back');
      }

      // Delete created users and their related records.
      // Use parameterized queries with sql.join for safe IN clauses.
      if (createdUserIds && createdUserIds.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < createdUserIds.length; i += batchSize) {
          const batch = createdUserIds.slice(i, i + batchSize);
          const idParams = sql.join(batch.map((id) => sql`${id}`), sql`, `);

          // Delete related records first (no FK cascade on all tables)
          await tx.execute(
            sql`DELETE FROM role_assignments WHERE tenant_id = ${ctx.tenantId} AND user_id IN (${idParams})`
          );
          await tx.execute(
            sql`DELETE FROM user_locations WHERE tenant_id = ${ctx.tenantId} AND user_id IN (${idParams})`
          );
          await tx.execute(
            sql`DELETE FROM user_security WHERE user_id IN (${idParams})`
          );
          await tx.execute(
            sql`DELETE FROM users WHERE tenant_id = ${ctx.tenantId} AND id IN (${idParams})`
          );
        }
      }

      // Mark job as rolled back
      await tx.update(staffImportJobs).set({
        status: 'rolled_back',
        updatedAt: sql`NOW()`,
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
  entitlement: 'platform_core',
  permission: 'users.manage',
});
