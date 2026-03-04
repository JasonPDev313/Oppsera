/**
 * M22: processed_events TTL cleanup cron.
 *
 * Vercel Cron daily at 3 AM UTC:
 * DELETE rows from processed_events that are older than 7 days.
 * 7 days is more than enough to cover all retry windows (max 3x retries
 * within minutes), while preventing unbounded table growth.
 */

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // ── Auth: Vercel Cron secret ────────────────────────────────────────

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { db } = await import('@oppsera/db');

    // Intentionally cross-tenant: cron cleans stale idempotency records for ALL tenants.
    // RLS is enabled but not forced; db.execute runs as service role.

    const result = await db.execute(sql`
      DELETE FROM processed_events
      WHERE processed_at < NOW() - INTERVAL '7 days'
    `);

    return NextResponse.json({
      data: {
        deletedRows: result.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[cleanup-processed-events] Cron failed:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
