import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@oppsera/db';
import { platformRestoreOperations, platformBackups } from '@oppsera/db/schema';
import { eq, and, lt, desc, type SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';

// ── GET /api/v1/admin/backups/restores — List restore operations ──

export const GET = withAdminAuth(async (req: NextRequest) => {
  const params = new URL(req.url).searchParams;
  const status = params.get('status');
  const cursor = params.get('cursor');
  const limit = Math.min(Number(params.get('limit') ?? 50), 100);

  const conditions: SQL[] = [];

  if (status) {
    conditions.push(eq(platformRestoreOperations.status, status));
  }
  if (cursor) {
    conditions.push(
      lt(
        platformRestoreOperations.createdAt,
        sql`(SELECT created_at FROM platform_restore_operations WHERE id = ${cursor})`,
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: platformRestoreOperations.id,
      backupId: platformRestoreOperations.backupId,
      status: platformRestoreOperations.status,
      safetyBackupId: platformRestoreOperations.safetyBackupId,
      requestedByAdminId: platformRestoreOperations.requestedByAdminId,
      approvedByAdminId: platformRestoreOperations.approvedByAdminId,
      rejectedByAdminId: platformRestoreOperations.rejectedByAdminId,
      rejectionReason: platformRestoreOperations.rejectionReason,
      confirmationPhrase: platformRestoreOperations.confirmationPhrase,
      tablesRestored: platformRestoreOperations.tablesRestored,
      rowsRestored: platformRestoreOperations.rowsRestored,
      errorMessage: platformRestoreOperations.errorMessage,
      approvedAt: platformRestoreOperations.approvedAt,
      startedAt: platformRestoreOperations.startedAt,
      completedAt: platformRestoreOperations.completedAt,
      createdAt: platformRestoreOperations.createdAt,
      updatedAt: platformRestoreOperations.updatedAt,
      backupLabel: platformBackups.label,
      backupType: platformBackups.type,
      backupTableCount: platformBackups.tableCount,
      backupRowCount: platformBackups.rowCount,
    })
    .from(platformRestoreOperations)
    .leftJoin(platformBackups, eq(platformBackups.id, platformRestoreOperations.backupId))
    .where(where)
    .orderBy(desc(platformRestoreOperations.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    data: items.map((row) => ({
      id: row.id,
      backupId: row.backupId,
      status: row.status,
      safetyBackupId: row.safetyBackupId ?? null,
      requestedByAdminId: row.requestedByAdminId,
      approvedByAdminId: row.approvedByAdminId ?? null,
      rejectedByAdminId: row.rejectedByAdminId ?? null,
      rejectionReason: row.rejectionReason ?? null,
      confirmationPhrase: row.confirmationPhrase ?? null,
      tablesRestored: row.tablesRestored ?? null,
      rowsRestored: row.rowsRestored ?? null,
      errorMessage: row.errorMessage ?? null,
      approvedAt: row.approvedAt ?? null,
      startedAt: row.startedAt ?? null,
      completedAt: row.completedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      backup: {
        label: row.backupLabel ?? null,
        type: row.backupType ?? null,
        tableCount: row.backupTableCount ?? null,
        rowCount: row.backupRowCount ?? null,
      },
    })),
    meta: {
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    },
  });
}, 'super_admin');
