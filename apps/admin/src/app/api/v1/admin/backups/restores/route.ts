import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';

// ── GET /api/v1/admin/backups/restores — List restore operations ──

export const GET = withAdminAuth(async (req: NextRequest) => {
  const params = new URL(req.url).searchParams;
  const status = params.get('status');
  const cursor = params.get('cursor');
  const limit = Math.min(Number(params.get('limit') ?? 50), 100);

  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (status) {
    conditions.push(`r.status = $${paramIdx}`);
    values.push(status);
    paramIdx++;
  }
  if (cursor) {
    conditions.push(`r.created_at < (SELECT created_at FROM platform_restore_operations WHERE id = $${paramIdx})`);
    values.push(cursor);
    paramIdx++;
  }

  const where = conditions.join(' AND ');
  const result = await db.execute(
    sql.raw(
      `SELECT r.id, r.backup_id, r.status, r.safety_backup_id,
              r.requested_by_admin_id, r.approved_by_admin_id,
              r.rejected_by_admin_id, r.rejection_reason,
              r.confirmation_phrase, r.tables_restored, r.rows_restored,
              r.error_message, r.approved_at, r.started_at,
              r.completed_at, r.created_at, r.updated_at,
              b.label AS backup_label, b.type AS backup_type,
              b.table_count AS backup_table_count, b.row_count AS backup_row_count
       FROM platform_restore_operations r
       LEFT JOIN platform_backups b ON b.id = r.backup_id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT ${limit + 1}`,
    ),
    values as never,
  );

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    data: items.map((row) => ({
      id: row.id,
      backupId: row.backup_id,
      status: row.status,
      safetyBackupId: row.safety_backup_id ?? null,
      requestedByAdminId: row.requested_by_admin_id,
      approvedByAdminId: row.approved_by_admin_id ?? null,
      rejectedByAdminId: row.rejected_by_admin_id ?? null,
      rejectionReason: row.rejection_reason ?? null,
      confirmationPhrase: row.confirmation_phrase ?? null,
      tablesRestored: row.tables_restored ?? null,
      rowsRestored: row.rows_restored ?? null,
      errorMessage: row.error_message ?? null,
      approvedAt: row.approved_at ?? null,
      startedAt: row.started_at ?? null,
      completedAt: row.completed_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      backup: {
        label: row.backup_label ?? null,
        type: row.backup_type ?? null,
        tableCount: row.backup_table_count ?? null,
        rowCount: row.backup_row_count ?? null,
      },
    })),
    meta: {
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    },
  });
}, 'super_admin');
