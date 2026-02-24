import { NextResponse } from 'next/server';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getBackupSettingsFromDb } from '@/lib/backup/retention-service';

// ── GET /api/v1/admin/backups/stats — Backup statistics ──────────

export const GET = withAdminAuth(async () => {
  const [countResult, sizeResult, lastResult] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress
      FROM platform_backups
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(size_bytes), 0) AS total_size
      FROM platform_backups
      WHERE status = 'completed'
    `),
    db.execute(sql`
      SELECT completed_at
      FROM platform_backups
      WHERE status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `),
  ]);

  const counts = Array.from(countResult as Iterable<Record<string, unknown>>)[0]!;
  const size = Array.from(sizeResult as Iterable<Record<string, unknown>>)[0]!;
  const last = Array.from(lastResult as Iterable<Record<string, unknown>>);

  const settings = await getBackupSettingsFromDb();
  let nextScheduledAt: string | null = null;
  if (settings.schedulingEnabled && settings.lastScheduledBackupAt) {
    const nextTime = new Date(settings.lastScheduledBackupAt.getTime() + settings.intervalMinutes * 60 * 1000);
    nextScheduledAt = nextTime.toISOString();
  }

  return NextResponse.json({
    data: {
      totalBackups: Number(counts.total),
      completedBackups: Number(counts.completed),
      failedBackups: Number(counts.failed),
      inProgressBackups: Number(counts.in_progress),
      totalSizeBytes: Number(size.total_size),
      lastBackupAt: last[0]?.completed_at ?? null,
      nextScheduledAt,
      schedulingEnabled: settings.schedulingEnabled,
    },
  });
}, 'super_admin');
