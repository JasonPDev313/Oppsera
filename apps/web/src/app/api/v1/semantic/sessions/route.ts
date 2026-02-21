import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listEvalSessions } from '@oppsera/module-semantic/evaluation';

// GET /api/v1/semantic/sessions
// Returns paginated list of chat sessions for the current tenant.

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const cursor = searchParams.get('cursor') ?? undefined;

    const result = await listEvalSessions(ctx.tenantId, { limit, cursor });

    return NextResponse.json({
      data: {
        sessions: result.sessions,
        cursor: result.cursor,
        hasMore: result.hasMore,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.query' },
);
