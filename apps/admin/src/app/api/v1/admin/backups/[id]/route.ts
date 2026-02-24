import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@oppsera/db';
import { platformBackups } from '@oppsera/db/schema';
import { sql, eq } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getBackupStorage } from '@/lib/backup/storage';

// ── GET /api/v1/admin/backups/[id] — Backup detail ───────────────

export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing backup ID' } },
      { status: 400 },
    );
  }

  const result = await db.execute(
    sql`SELECT * FROM platform_backups WHERE id = ${id}`,
  );
  const rows = Array.from(result as Iterable<Record<string, unknown>>);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Backup not found' } },
      { status: 404 },
    );
  }

  const row = rows[0]!;
  return NextResponse.json({
    data: {
      id: row.id,
      type: row.type,
      status: row.status,
      label: row.label,
      tableCount: row.table_count ?? null,
      rowCount: row.row_count ?? null,
      sizeBytes: row.size_bytes ?? null,
      checksum: row.checksum ?? null,
      retentionTag: row.retention_tag ?? null,
      expiresAt: row.expires_at ?? null,
      storageDriver: row.storage_driver,
      storagePath: row.storage_path ?? null,
      initiatedByAdminId: row.initiated_by_admin_id ?? null,
      errorMessage: row.error_message ?? null,
      metadata: row.metadata ?? null,
      startedAt: row.started_at ?? null,
      completedAt: row.completed_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}, 'super_admin');

// ── DELETE /api/v1/admin/backups/[id] — Delete a backup ──────────

export const DELETE = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing backup ID' } },
      { status: 400 },
    );
  }

  const result = await db.execute(
    sql`SELECT id, storage_driver, storage_path, status FROM platform_backups WHERE id = ${id}`,
  );
  const rows = Array.from(result as Iterable<{
    id: string;
    storage_driver: string;
    storage_path: string | null;
    status: string;
  }>);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Backup not found' } },
      { status: 404 },
    );
  }

  const backup = rows[0]!;

  // Don't delete in-progress backups
  if (backup.status === 'in_progress') {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: 'Cannot delete an in-progress backup' } },
      { status: 409 },
    );
  }

  // Delete storage file
  if (backup.storage_path) {
    try {
      const storage = getBackupStorage(backup.storage_driver);
      await storage.delete(backup.storage_path);
    } catch (err) {
      console.error(`[backup-delete] Failed to delete storage for ${id}:`, err);
    }
  }

  // Delete DB record
  await db.delete(platformBackups).where(eq(platformBackups.id, id));

  return NextResponse.json({ data: { deleted: true } });
}, 'super_admin');
