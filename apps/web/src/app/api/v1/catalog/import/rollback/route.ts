/**
 * POST /api/v1/catalog/import/rollback
 *
 * Rolls back a completed catalog/inventory import by deleting all items
 * that were created. Updated items are NOT reverted.
 *
 * Expects: { importLogId: string, createdItemIds?: string[] }
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, catalogImportLogs } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';

async function handler(req: NextRequest, ctx: RequestContext) {
  const body = await req.json();
  const { importLogId, createdItemIds } = body as {
    importLogId: string;
    createdItemIds?: string[];
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
        .select({ id: catalogImportLogs.id, status: catalogImportLogs.status })
        .from(catalogImportLogs)
        .where(sql`${catalogImportLogs.id} = ${importLogId} AND ${catalogImportLogs.tenantId} = ${ctx.tenantId}`)
        .limit(1);

      if (!log) {
        throw new Error('Import log not found');
      }

      if (log.status === 'rolled_back') {
        throw new Error('Import has already been rolled back');
      }

      // Delete created catalog items and their related records.
      if (createdItemIds && createdItemIds.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < createdItemIds.length; i += batchSize) {
          const batch = createdItemIds.slice(i, i + batchSize);
          const idParams = sql.join(batch.map((id) => sql`${id}`), sql`, `);

          // Delete related records first
          await tx.execute(
            sql`DELETE FROM catalog_item_modifier_groups WHERE tenant_id = ${ctx.tenantId} AND catalog_item_id IN (${idParams})`
          );
          await tx.execute(
            sql`DELETE FROM catalog_item_option_sets WHERE tenant_id = ${ctx.tenantId} AND catalog_item_id IN (${idParams})`
          );
          await tx.execute(
            sql`DELETE FROM catalog_item_change_logs WHERE tenant_id = ${ctx.tenantId} AND item_id IN (${idParams})`
          );
          // Delete the items themselves
          await tx.execute(
            sql`DELETE FROM catalog_items WHERE tenant_id = ${ctx.tenantId} AND id IN (${idParams})`
          );
        }
      }

      // Mark import log as rolled back
      await tx.update(catalogImportLogs).set({
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
  entitlement: 'catalog',
  permission: 'catalog.manage',
  writeAccess: true,
});
