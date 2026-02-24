import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { createBackup } from '@/lib/backup/backup-service';

// ── GET /api/v1/admin/backups — List backups ─────────────────────

export const GET = withAdminAuth(async (req: NextRequest) => {
  const params = new URL(req.url).searchParams;
  const status = params.get('status');
  const type = params.get('type');
  const cursor = params.get('cursor');
  const limit = Math.min(Number(params.get('limit') ?? 50), 100);

  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (status) {
    conditions.push(`status = $${paramIdx}`);
    values.push(status);
    paramIdx++;
  }
  if (type) {
    conditions.push(`type = $${paramIdx}`);
    values.push(type);
    paramIdx++;
  }
  if (cursor) {
    conditions.push(`created_at < (SELECT created_at FROM platform_backups WHERE id = $${paramIdx})`);
    values.push(cursor);
    paramIdx++;
  }

  const where = conditions.join(' AND ');
  const result = await (db.execute as any)(
    sql.raw(
      `SELECT id, type, status, label, table_count, row_count, size_bytes,
              retention_tag, expires_at, storage_driver, initiated_by_admin_id,
              started_at, completed_at, created_at, updated_at, error_message
       FROM platform_backups
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ${limit + 1}`,
    ),
    values,
  );

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    data: items.map(mapBackupRow),
    meta: {
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    },
  });
}, 'super_admin');

// ── POST /api/v1/admin/backups — Create manual backup ────────────

const createSchema = z.object({
  label: z.string().max(200).optional(),
});

export const POST = withAdminAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
      { status: 400 },
    );
  }

  const result = await createBackup({
    type: 'manual',
    label: parsed.data.label ?? `Manual backup by ${session.name}`,
    adminId: session.adminId,
  });

  return NextResponse.json({ data: result }, { status: 201 });
}, 'super_admin');

// ── Helpers ──────────────────────────────────────────────────────

function mapBackupRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    label: row.label,
    tableCount: row.table_count ?? null,
    rowCount: row.row_count ?? null,
    sizeBytes: row.size_bytes ?? null,
    retentionTag: row.retention_tag ?? null,
    expiresAt: row.expires_at ?? null,
    storageDriver: row.storage_driver,
    initiatedByAdminId: row.initiated_by_admin_id ?? null,
    errorMessage: row.error_message ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
