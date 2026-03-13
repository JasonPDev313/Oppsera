import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGlPostingGaps, getSmartResolutionSuggestions } from '@oppsera/module-accounting';

/**
 * GET /api/v1/accounting/gl-readiness
 *
 * Quick readiness check: are there unposted tenders, unmapped events,
 * or auto-resolvable suggestions? Frontend uses this to decide whether
 * to show the GLReadinessBanner and auto-trigger backfill.
 *
 * SEQUENTIAL execution: each query uses withTenant (1 DB connection).
 * Running all 3 in parallel required 3+ connections, which exceeds
 * the Vercel pool max:2 — causing connection timeouts and the
 * "GL readiness check failed" error. Sequential is slightly slower
 * but stays within pool limits. Short-circuits when possible:
 * if gaps found, skip suggestions (backfill runs first anyway).
 */
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const { tenantId } = ctx;

    // Date range: last 2 years (covers all historical data)
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10);

    // 1. Check GL posting gaps first (most common reason for banner)
    const gaps = await getGlPostingGaps({ tenantId, startDate, endDate }).catch(() => ({
      totalTenders: 0,
      tendersWithGl: 0,
      tendersWithoutGl: 0,
      isFullyCovered: true,
      missingTenderIds: [] as string[],
    }));

    // Short-circuit: if gaps found, backfill is needed — skip expensive suggestions query
    if (gaps.tendersWithoutGl > 0) {
      return NextResponse.json({
        data: {
          isFullyCovered: false,
          totalTenders: gaps.totalTenders,
          tendersWithoutGl: gaps.tendersWithoutGl,
          unmappedEventCount: 0,
          autoResolvableCount: 0,
          status: 'needs_backfill' as const,
        },
      });
    }

    // 2. No gaps — check unmapped events via smart resolution suggestions.
    //    This gives us the real totalEvents count (not a limit-1 presence check)
    //    plus autoResolvable in a single query, avoiding an extra listUnmappedEvents call.
    const suggestions = await getSmartResolutionSuggestions(tenantId).catch(() => ({
      suggestions: [],
      totalEvents: 0,
      autoResolvable: 0,
      alreadyMapped: 0,
      skippedErrors: 0,
    }));

    // Exclude non-actionable events (zero_dollar_order, reversal_no_original, etc.)
    // from the review count — same logic the backfill route uses at line 158/164.
    const actionableEvents = Math.max(0, (suggestions.totalEvents ?? 0) - (suggestions.skippedErrors ?? 0));
    const unmappedEventCount = actionableEvents;
    const autoResolvableCount = suggestions.autoResolvable ?? 0;

    const status: 'ready' | 'needs_backfill' | 'needs_review' =
      unmappedEventCount > 0 ? 'needs_review' : 'ready';

    return NextResponse.json({
      data: {
        isFullyCovered: gaps.isFullyCovered && unmappedEventCount === 0,
        totalTenders: gaps.totalTenders,
        tendersWithoutGl: gaps.tendersWithoutGl,
        unmappedEventCount,
        autoResolvableCount,
        status,
      },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
