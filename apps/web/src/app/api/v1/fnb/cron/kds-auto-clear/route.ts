import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { kdsAutoClearStale } from '@oppsera/module-fnb';

/**
 * POST /api/v1/fnb/cron/kds-auto-clear
 *
 * Vercel Cron trigger — voids stale KDS ticket items from previous
 * business dates for locations with stale_ticket_mode = 'auto_clear'.
 *
 * Schedule: every 15 minutes (configured in vercel.json).
 * Auth: CRON_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[kds-auto-clear] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await kdsAutoClearStale();

    if (result.voidedItemCount > 0 || result.voidedTicketCount > 0) {
      console.log(
        `[kds-auto-clear] Voided ${result.voidedItemCount} items, ${result.voidedTicketCount} tickets across ${result.locationsProcessed} locations`,
      );
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[kds-auto-clear] Failed:', err);
    return NextResponse.json({ error: 'Auto-clear failed' }, { status: 500 });
  }
}
