import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { scoreAllTenants } from '@oppsera/core/usage/attrition-engine';

// ── GET /api/v1/analytics/attrition/cron — Nightly attrition scoring ──
// Protected by CRON_SECRET header (Vercel Cron Jobs).
// Runs scoring for all tenants on a schedule so the dashboard is always fresh.

export const maxDuration = 120; // scoring iterates all tenants — needs headroom

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 },
      );
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[attrition-cron] CRON_SECRET not configured — rejecting request in production');
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'CRON_SECRET not configured' } },
      { status: 403 },
    );
  }

  try {
    const result = await scoreAllTenants();
    console.log(`[attrition-cron] Scoring complete: ${result.scored} tenants, ${result.highRisk} high-risk, ${result.errors} errors, ${result.elapsedMs}ms`);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof Error && err.message === 'SCORING_IN_PROGRESS') {
      // Not an error — another request (manual or concurrent cron) is already scoring
      return NextResponse.json(
        { data: { skipped: true, reason: 'scoring_in_progress' } },
        { status: 200 },
      );
    }
    console.error('[attrition-cron] Scoring failed:', err);
    return NextResponse.json(
      { error: { code: 'SCORING_FAILED', message: err instanceof Error ? err.message : 'Unknown error' } },
      { status: 500 },
    );
  }
}
