/**
 * Phase 7B: Stale tab cleanup cron.
 *
 * Vercel Cron every 15 minutes:
 * 1. Close tabs where lastActivityAt > 24 hours (stale)
 * 2. Clear orderId on tabs referencing completed/voided orders
 */

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // ── Auth: Vercel Cron secret ────────────────────────────────────────

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { db } = await import('@oppsera/db');

    // Intentionally cross-tenant: cron cleans stale tabs for ALL tenants.
    // RLS is enabled but not forced; db.execute runs as service role.

    // 1. Mark stale tabs as closed (lastActivityAt > 24h)
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleResult = await db.execute(sql`
      UPDATE register_tabs
      SET status = 'closed',
          updated_at = NOW(),
          version = version + 1
      WHERE status = 'active'
        AND last_activity_at IS NOT NULL
        AND last_activity_at < ${staleThreshold}
      RETURNING id
    `);

    // 2. Clear orderId on tabs whose order is no longer open
    const clearedResult = await db.execute(sql`
      UPDATE register_tabs t
      SET order_id = NULL,
          label = NULL,
          folio_id = NULL,
          guest_name = NULL,
          updated_at = NOW(),
          version = version + 1
      FROM orders o
      WHERE t.order_id = o.id
        AND t.order_id IS NOT NULL
        AND t.status = 'active'
        AND o.status IN ('placed', 'voided', 'closed')
      RETURNING t.id
    `);

    return NextResponse.json({
      data: {
        staleTabsClosed: staleResult.length,
        tabsCleared: clearedResult.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[cleanup-tabs] Cron failed:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
