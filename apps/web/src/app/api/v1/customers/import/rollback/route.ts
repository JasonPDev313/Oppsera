/**
 * POST /api/v1/customers/import/rollback
 *
 * Rolls back a completed customer import by deleting all customers
 * that were created. Updated customers are NOT reverted.
 *
 * Expects: { importLogId: string, createdCustomerIds?: string[] }
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, customerImportLogs } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';

async function handler(req: NextRequest, ctx: RequestContext) {
  const body = await req.json();
  const { importLogId, createdCustomerIds } = body as {
    importLogId: string;
    createdCustomerIds?: string[];
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
        .select({ id: customerImportLogs.id, status: customerImportLogs.status })
        .from(customerImportLogs)
        .where(sql`${customerImportLogs.id} = ${importLogId} AND ${customerImportLogs.tenantId} = ${ctx.tenantId}`)
        .limit(1);

      if (!log) {
        throw new Error('Import log not found');
      }

      if (log.status === 'rolled_back') {
        throw new Error('Import has already been rolled back');
      }

      // Delete created customers and their related records.
      if (createdCustomerIds && createdCustomerIds.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < createdCustomerIds.length; i += batchSize) {
          const batch = createdCustomerIds.slice(i, i + batchSize);
          const idParams = sql.join(batch.map((id) => sql`${id}`), sql`, `);

          // Delete related records first (no FK cascade on all tables)
          await tx.execute(
            sql`DELETE FROM customer_contacts WHERE tenant_id = ${ctx.tenantId} AND customer_id IN (${idParams})`
          );
          await tx.execute(
            sql`DELETE FROM customer_preferences WHERE tenant_id = ${ctx.tenantId} AND customer_id IN (${idParams})`
          );
          await tx.execute(
            sql`DELETE FROM customer_identifiers WHERE tenant_id = ${ctx.tenantId} AND customer_id IN (${idParams})`
          );
          await tx.execute(
            sql`DELETE FROM customer_external_ids WHERE tenant_id = ${ctx.tenantId} AND customer_id IN (${idParams})`
          );
          await tx.execute(
            sql`DELETE FROM customer_activity_log WHERE tenant_id = ${ctx.tenantId} AND customer_id IN (${idParams})`
          );
          // Delete the customers themselves
          await tx.execute(
            sql`DELETE FROM customers WHERE tenant_id = ${ctx.tenantId} AND id IN (${idParams})`
          );
        }
      }

      // Mark import log as rolled back
      await tx.update(customerImportLogs).set({
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
  entitlement: 'customers',
  permission: 'customers.manage',
  writeAccess: true,
});
