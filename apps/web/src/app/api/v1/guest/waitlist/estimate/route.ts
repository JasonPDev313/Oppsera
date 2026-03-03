import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@oppsera/db';
import { sql } from 'drizzle-orm';

/**
 * GET /api/v1/guest/waitlist/estimate?locationId=xxx
 * Public endpoint — returns current queue length and estimated wait.
 * Uses admin client to bypass RLS (no tenant context in guest routes).
 */
export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get('locationId');
  if (!locationId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'locationId is required' } },
      { status: 400 },
    );
  }

  try {
    const adminDb = createAdminClient();
    const businessDate = new Date().toISOString().slice(0, 10);

    // Get queue length + venue name in parallel
    const [queueRows, locRows] = await Promise.all([
      adminDb.execute(sql`
        SELECT COUNT(*) AS queue_length
        FROM fnb_waitlist_entries
        WHERE location_id = ${locationId}
          AND business_date = ${businessDate}
          AND status IN ('waiting', 'notified')
      `),
      adminDb.execute(sql`
        SELECT name FROM locations WHERE id = ${locationId} LIMIT 1
      `),
    ]);

    const queueLength = Number(
      (Array.from(queueRows as Iterable<Record<string, unknown>>)[0] as Record<string, unknown>)?.queue_length ?? 0,
    );
    const venueName = String(
      (Array.from(locRows as Iterable<Record<string, unknown>>)[0] as Record<string, unknown>)?.name ?? '',
    );

    const estimatedMinutes = Math.max(5, queueLength * 5);

    return NextResponse.json({
      data: {
        estimatedMinutes,
        currentQueueLength: queueLength,
        venueName,
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to get estimate' } },
      { status: 500 },
    );
  }
}
