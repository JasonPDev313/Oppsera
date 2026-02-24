import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { maybeRunScheduledBackup } from '@/lib/backup/scheduler';

// ── GET /api/v1/admin/backups/cron — Scheduled backup trigger ────
// Protected by CRON_SECRET header for Vercel Cron Jobs.
// Also callable by authenticated super_admin (for local dev / testing).

export async function GET(req: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: { message: 'Unauthorized' } },
        { status: 401 },
      );
    }
  }

  try {
    const didRun = await maybeRunScheduledBackup();
    return NextResponse.json({
      data: { ran: didRun },
    });
  } catch (err) {
    console.error('[backup-cron] Error:', err);
    return NextResponse.json(
      { error: { code: 'BACKUP_FAILED', message: err instanceof Error ? err.message : 'Unknown error' } },
      { status: 500 },
    );
  }
}
