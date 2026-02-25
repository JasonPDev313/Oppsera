/**
 * POST /api/v1/accounting/coa-import/rollback
 *
 * Rolls back a completed COA import by deleting all GL accounts
 * that were created. Only newly created accounts are deleted.
 *
 * Expects: { importLogId: string, createdAccountIds?: string[] }
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, glCoaImportLogs } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';

async function handler(req: NextRequest, ctx: RequestContext) {
  const body = await req.json();
  const { importLogId, createdAccountIds } = body as {
    importLogId: string;
    createdAccountIds?: string[];
  };

  if (!importLogId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'importLogId is required' } },
      { status: 400 },
    );
  }

  try {
    await withTenant(ctx.tenantId, async (tx) => {
      // Verify the import log belongs to this tenant
      const [log] = await tx
        .select({ id: glCoaImportLogs.id, status: glCoaImportLogs.status })
        .from(glCoaImportLogs)
        .where(sql`${glCoaImportLogs.id} = ${importLogId} AND ${glCoaImportLogs.tenantId} = ${ctx.tenantId}`)
        .limit(1);

      if (!log) {
        throw new Error('Import log not found');
      }

      if (log.status === 'rolled_back') {
        throw new Error('Import has already been rolled back');
      }

      // Delete created GL accounts.
      // Clear parent references first to avoid FK constraint violations.
      if (createdAccountIds && createdAccountIds.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < createdAccountIds.length; i += batchSize) {
          const batch = createdAccountIds.slice(i, i + batchSize);
          const idParams = sql.join(batch.map((id) => sql`${id}`), sql`, `);

          // Clear parent account references pointing to any of these accounts
          await tx.execute(
            sql`UPDATE gl_accounts SET parent_account_id = NULL WHERE tenant_id = ${ctx.tenantId} AND parent_account_id IN (${idParams})`
          );
          // Delete the accounts
          await tx.execute(
            sql`DELETE FROM gl_accounts WHERE tenant_id = ${ctx.tenantId} AND id IN (${idParams})`
          );
        }
      }

      // Mark import log as rolled back
      await tx.update(glCoaImportLogs).set({
        status: 'rolled_back',
      }).where(sql`id = ${importLogId}`);
    });

    return NextResponse.json({ data: { success: true, importLogId } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Rollback failed';
    return NextResponse.json(
      { error: { code: 'ROLLBACK_ERROR', message } },
      { status: 500 },
    );
  }
}

export const POST = withMiddleware(handler, {
  entitlement: 'accounting',
  permission: 'accounting.manage',
  writeAccess: true,
});
