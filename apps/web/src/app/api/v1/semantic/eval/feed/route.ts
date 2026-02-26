import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getEvalFeed } from '@oppsera/module-semantic/evaluation';
import { parseLimit } from '@/lib/api-params';

// GET /api/v1/semantic/eval/feed
// Returns the paginated eval turn feed for the current tenant.
// Used by the AI Insights History page to show past queries.

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const limit = parseLimit(searchParams.get('limit'), 100, 25);
    const cursor = searchParams.get('cursor') ?? undefined;
    const status = (searchParams.get('status') ?? 'all') as 'unreviewed' | 'reviewed' | 'flagged' | 'all';
    const sortBy = (searchParams.get('sortBy') ?? 'newest') as
      | 'newest'
      | 'lowest_rated'
      | 'lowest_confidence'
      | 'slowest'
      | 'most_flagged';
    const search = searchParams.get('search') ?? undefined;

    const result = await getEvalFeed(ctx.tenantId, {
      limit,
      cursor,
      status,
      sortBy,
      search,
    });

    // Return a subset of fields safe for the user-facing history view
    const turns = result.turns.map((turn) => ({
      id: turn.id,
      userMessage: turn.userMessage,
      turnNumber: turn.turnNumber,
      sessionId: turn.sessionId,
      wasClarification: turn.wasClarification,
      rowCount: turn.rowCount,
      executionError: turn.executionError,
      cacheStatus: turn.cacheStatus,
      userRating: turn.userRating,
      userThumbsUp: turn.userThumbsUp,
      qualityScore: turn.qualityScore !== null ? Number(turn.qualityScore) : null,
      createdAt: turn.createdAt,
    }));

    return NextResponse.json({
      data: {
        turns,
        cursor: result.cursor,
        hasMore: result.hasMore,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.query' },
);
