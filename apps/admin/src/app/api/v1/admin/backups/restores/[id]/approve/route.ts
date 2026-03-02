import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@oppsera/db';
import { platformRestoreOperations } from '@oppsera/db/schema';
import { sql, eq } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { executeRestore, executeTenantRestore } from '@/lib/backup/restore-service';

// ── POST /api/v1/admin/backups/restores/[id]/approve — Approve restore

export const POST = withAdminAuth(async (_req: NextRequest, session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing restore operation ID' } },
      { status: 400 },
    );
  }

  // Get restore operation (include scope_tenant_id for dispatch)
  const result = await db.execute(
    sql`SELECT id, status, requested_by_admin_id, scope_tenant_id
        FROM platform_restore_operations WHERE id = ${id}`,
  );
  const rows = Array.from(result as Iterable<{
    id: string;
    status: string;
    requested_by_admin_id: string;
    scope_tenant_id: string | null;
  }>);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Restore operation not found' } },
      { status: 404 },
    );
  }

  const op = rows[0]!;

  if (op.status !== 'pending_approval') {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: `Cannot approve — status is "${op.status}"` } },
      { status: 409 },
    );
  }

  // Enforce dual-admin: approver must differ from requester
  if (op.requested_by_admin_id === session.adminId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Cannot approve your own restore request. A different admin must approve.' } },
      { status: 403 },
    );
  }

  // Approve
  const now = new Date();
  await db
    .update(platformRestoreOperations)
    .set({
      status: 'approved',
      approvedByAdminId: session.adminId,
      approvedAt: now,
      updatedAt: now,
    })
    .where(eq(platformRestoreOperations.id, id));

  // Execute restore — MUST await before returning response (Vercel gotcha #466).
  // Fire-and-forget DB work creates zombie connections on Vercel serverless.
  try {
    if (op.scope_tenant_id) {
      await executeTenantRestore(id);
    } else {
      await executeRestore(id);
    }
  } catch (err) {
    console.error(`[restore] Restore ${id} failed:`, err);
    return NextResponse.json({
      error: {
        code: 'RESTORE_FAILED',
        message: err instanceof Error ? err.message : 'Restore failed',
      },
    }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      id,
      status: 'completed',
      message: op.scope_tenant_id
        ? `Tenant-scoped restore approved and completed for tenant ${op.scope_tenant_id}.`
        : 'Restore approved and completed successfully.',
    },
  });
}, 'super_admin');
