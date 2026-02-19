import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGolfCustomers } from '@oppsera/module-golf-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;
    const sortBy = (url.searchParams.get('sortBy') as 'totalRounds' | 'totalRevenue' | 'lastPlayedAt') ?? undefined;
    const sortDir = (url.searchParams.get('sortDir') as 'asc' | 'desc') ?? undefined;

    const result = await getGolfCustomers({
      tenantId: ctx.tenantId,
      cursor,
      limit,
      sortBy,
      sortDir,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'reporting', permission: 'reports.view' },
);
