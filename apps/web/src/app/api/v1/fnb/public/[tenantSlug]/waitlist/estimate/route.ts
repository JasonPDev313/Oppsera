import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS, rateLimitHeaders } from '@oppsera/core/security';
import { resolveWaitlistTenant } from '../../resolve-waitlist-tenant';

/**
 * GET /api/v1/fnb/public/[tenantSlug]/waitlist/estimate
 *
 * Returns current estimated wait time and queue length without requiring the guest to join.
 * Rate-limited, no auth required.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;

  // Rate limit
  const rlKey = getRateLimitKey(req, 'wl-estimate');
  const rl = checkRateLimit(rlKey, RATE_LIMITS.publicRead);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    const resolved = await resolveWaitlistTenant(tenantSlug);
    if (!resolved) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Waitlist not found or not enabled' } },
        { status: 404 },
      );
    }

    const { tenantId, locationId, locationName, tenantName, config } = resolved;

    if (!config.queueConfig.allowCheckWaitBeforeJoining) {
      return NextResponse.json(
        { error: { code: 'NOT_AVAILABLE', message: 'Wait time estimates are not available' } },
        { status: 403 },
      );
    }

    const adminDb = createAdminClient();
    const businessDate = new Date().toISOString().slice(0, 10);

    // Run queue count + rolling avg wait time in parallel
    const [queueRows, avgWaitRows] = await Promise.all([
      adminDb.execute(sql`
        SELECT COUNT(*) AS queue_length
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND business_date = ${businessDate}
          AND status IN ('waiting', 'notified')
      `),
      // Rolling average from last 50 seated entries (subquery so LIMIT applies before AVG)
      adminDb.execute(sql`
        SELECT
          COALESCE(AVG(actual_wait_minutes), 0)::numeric(10,1) AS avg_wait,
          COUNT(*) AS sample_size
        FROM (
          SELECT actual_wait_minutes
          FROM fnb_waitlist_entries
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND status = 'seated'
            AND actual_wait_minutes IS NOT NULL
            AND seated_at >= now() - interval '7 days'
          ORDER BY seated_at DESC
          LIMIT 50
        ) recent
      `),
    ]);

    const queueRow = Array.from(queueRows as Iterable<Record<string, unknown>>)[0];
    const avgRow = Array.from(avgWaitRows as Iterable<Record<string, unknown>>)[0];

    const queueLength = Number(queueRow?.queue_length ?? 0);
    const sampleSize = Number(avgRow?.sample_size ?? 0);
    const avgWait = Number(avgRow?.avg_wait ?? 0);

    // Use rolling average if enough data (>= 5 samples), else fall back to position heuristic.
    // avgWait = avg minutes a guest waited before being seated. For a new joiner at the
    // back of the queue this is the best estimate; scale linearly by queue depth.
    const estimatedMinutes = sampleSize >= 5
      ? Math.max(5, Math.round(avgWait))
      : Math.max(5, queueLength * 5);
    const accepting = queueLength < config.queueConfig.maxCapacity;

    return NextResponse.json({
      data: {
        estimatedMinutes,
        queueLength,
        accepting,
        venueName: locationName || tenantName,
      },
    }, { headers: rateLimitHeaders(rl) });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to get estimate' } },
      { status: 500 },
    );
  }
}
