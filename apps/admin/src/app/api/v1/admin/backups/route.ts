import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@oppsera/db';
import { platformBackups } from '@oppsera/db/schema';
import { desc, eq, and, lt, type SQL } from 'drizzle-orm';
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

  const conditions: SQL[] = [];

  if (status) {
    conditions.push(eq(platformBackups.status, status));
  }
  if (type) {
    conditions.push(eq(platformBackups.type, type));
  }
  if (cursor) {
    conditions.push(
      lt(
        platformBackups.createdAt,
        sql`(SELECT created_at FROM platform_backups WHERE id = ${cursor})`,
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: platformBackups.id,
      type: platformBackups.type,
      status: platformBackups.status,
      label: platformBackups.label,
      tableCount: platformBackups.tableCount,
      rowCount: platformBackups.rowCount,
      sizeBytes: platformBackups.sizeBytes,
      retentionTag: platformBackups.retentionTag,
      expiresAt: platformBackups.expiresAt,
      storageDriver: platformBackups.storageDriver,
      initiatedByAdminId: platformBackups.initiatedByAdminId,
      errorMessage: platformBackups.errorMessage,
      startedAt: platformBackups.startedAt,
      completedAt: platformBackups.completedAt,
      createdAt: platformBackups.createdAt,
      updatedAt: platformBackups.updatedAt,
    })
    .from(platformBackups)
    .where(where)
    .orderBy(desc(platformBackups.createdAt))
    .limit(limit + 1);

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
    tableCount: row.tableCount ?? null,
    rowCount: row.rowCount ?? null,
    sizeBytes: row.sizeBytes ?? null,
    retentionTag: row.retentionTag ?? null,
    expiresAt: row.expiresAt ?? null,
    storageDriver: row.storageDriver,
    initiatedByAdminId: row.initiatedByAdminId ?? null,
    errorMessage: row.errorMessage ?? null,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
