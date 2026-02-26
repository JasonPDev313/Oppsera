import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getUnmatchedTenders } from '@oppsera/module-accounting';
import { parseLimit } from '@/lib/api-params';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await getUnmatchedTenders({
      tenantId: ctx.tenantId,
      startDate: url.searchParams.get('startDate') ?? undefined,
      endDate: url.searchParams.get('endDate') ?? undefined,
      locationId: url.searchParams.get('locationId') ?? undefined,
      tenderType: url.searchParams.get('tenderType') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });
    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
