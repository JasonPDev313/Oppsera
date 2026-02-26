import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listClosePeriods } from '@oppsera/module-accounting';
import { parseLimit } from '@/lib/api-params';

// GET /api/v1/accounting/close-periods — list close periods
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = parseLimit(url.searchParams.get('limit'));

    const result = await listClosePeriods({
      tenantId: ctx.tenantId,
      status,
      cursor,
      limit,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
