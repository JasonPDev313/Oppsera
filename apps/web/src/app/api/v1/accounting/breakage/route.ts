import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listPendingBreakage, getPendingBreakageStats } from '@oppsera/module-accounting';

// GET /api/v1/accounting/breakage — list pending breakage reviews
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined;

    const result = await listPendingBreakage({
      tenantId: ctx.tenantId,
      status,
      cursor,
      limit,
    });

    const stats = await getPendingBreakageStats(ctx.tenantId);

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
      stats,
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
