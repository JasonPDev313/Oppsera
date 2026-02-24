import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getBackupStorage } from '@/lib/backup/storage';

// ── GET /api/v1/admin/backups/[id]/download — Download backup file

export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing backup ID' } },
      { status: 400 },
    );
  }

  const result = await db.execute(
    sql`SELECT storage_driver, storage_path, status, label
        FROM platform_backups WHERE id = ${id}`,
  );
  const rows = Array.from(result as Iterable<{
    storage_driver: string;
    storage_path: string | null;
    status: string;
    label: string | null;
  }>);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Backup not found' } },
      { status: 404 },
    );
  }

  const backup = rows[0]!;

  if (backup.status !== 'completed') {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: 'Only completed backups can be downloaded' } },
      { status: 409 },
    );
  }

  if (!backup.storage_path) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Backup file not found' } },
      { status: 404 },
    );
  }

  const storage = getBackupStorage(backup.storage_driver);
  const exists = await storage.exists(backup.storage_path);
  if (!exists) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Backup file not found on disk' } },
      { status: 404 },
    );
  }

  const data = await storage.read(backup.storage_path);
  const filename = `backup-${id}.json.gz`;

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(data.length),
    },
  });
}, 'super_admin');
