import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { expireWaitlistEntries } from '@oppsera/module-fnb';

/**
 * POST /api/v1/fnb/cron/waitlist-sweep
 *
 * Vercel Cron trigger — sweeps all tenants for notified waitlist entries
 * past their grace period and marks them expired.
 *
 * Schedule: every 2 minutes (configured in vercel.json).
 * Auth: CRON_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[waitlist-sweep] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await expireWaitlistEntries();

    if (result.expiredCount > 0) {
      console.log(`[waitlist-sweep] Expired ${result.expiredCount} entries: ${result.expiredIds.join(', ')}`);
    }

    return NextResponse.json({
      data: {
        expiredCount: result.expiredCount,
        swept: true,
      },
    });
  } catch (err) {
    console.error('[waitlist-sweep] Sweep failed:', err);
    return NextResponse.json(
      { error: 'Sweep failed' },
      { status: 500 },
    );
  }
}
