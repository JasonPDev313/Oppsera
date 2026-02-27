import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGlPostingGaps, getSmartResolutionSuggestions, listUnmappedEvents } from '@oppsera/module-accounting';

/**
 * GET /api/v1/accounting/gl-readiness
 *
 * Quick readiness check: are there unposted tenders, unmapped events,
 * or auto-resolvable suggestions? Frontend uses this to decide whether
 * to show the GLReadinessBanner and auto-trigger backfill.
 */
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const { tenantId } = ctx;

    // Date range: last 2 years (covers all historical data)
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10);

    const [gaps, unmapped, suggestions] = await Promise.all([
      getGlPostingGaps({ tenantId, startDate, endDate }).catch(() => ({
        totalTenders: 0,
        tendersWithGl: 0,
        tendersWithoutGl: 0,
        isFullyCovered: true,
        missingTenderIds: [] as string[],
      })),
      listUnmappedEvents({
        tenantId,
        limit: 1,
        resolved: false,
      }).catch(() => ({ items: [] as unknown[], cursor: null, hasMore: false })),
      getSmartResolutionSuggestions(tenantId).catch(() => ({
        suggestions: [],
        totalEvents: 0,
        autoResolvable: 0,
        alreadyMapped: 0,
        skippedErrors: 0,
      })),
    ]);

    const unmappedEventCount = unmapped.items.length;
    const autoResolvableCount = suggestions.autoResolvable ?? 0;

    let status: 'ready' | 'needs_backfill' | 'needs_review' = 'ready';
    if (gaps.tendersWithoutGl > 0) {
      status = 'needs_backfill';
    } else if (unmappedEventCount > 0) {
      status = 'needs_review';
    }

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
