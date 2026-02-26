import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listEvalSessions } from '@oppsera/module-semantic/evaluation';
import { parseLimit } from '@/lib/api-params';

// GET /api/v1/semantic/sessions
// Returns paginated list of chat sessions for the current tenant.

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const limit = parseLimit(searchParams.get('limit'), 100, 20);
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
