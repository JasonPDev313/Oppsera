import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient, sql } from '@oppsera/db';

/**
 * POST /api/v1/pms/cron/expire-waitlist-offers
 *
 * Vercel Cron trigger — expires all PMS waitlist offers whose
 * offer_expires_at has passed, across all tenants.
 *
 * Schedule: every 15 minutes (configure in vercel.json).
 * Auth: CRON_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[pms.expire-waitlist-offers] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminDb = createAdminClient();

    // Single atomic UPDATE across all tenants — no loop needed
    const result = await adminDb.execute(sql`
      UPDATE pms_waitlist
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'offered'
        AND offer_expires_at IS NOT NULL
        AND offer_expires_at <= NOW()
    `);

    const expiredCount = (result as { rowCount?: number }).rowCount ?? 0;

    if (expiredCount > 0) {
      console.log(`[pms.expire-waitlist-offers] Expired ${expiredCount} stale offers`);
    }

    return NextResponse.json({
      data: { expiredCount, swept: true },
    });
  } catch (err) {
    console.error('[pms.expire-waitlist-offers] Sweep failed:', err);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}
