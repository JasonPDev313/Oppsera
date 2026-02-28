import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getSalesHistory } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;
    const sourcesParam = url.searchParams.get('sources');
    const sources = sourcesParam ? sourcesParam.split(',').filter(Boolean) : undefined;

    const result = await getSalesHistory({
      tenantId: ctx.tenantId,
      locationId,
      sources,
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      paymentMethod: url.searchParams.get('paymentMethod') ?? undefined,
      sortBy: url.searchParams.get('sortBy') ?? undefined,
      sortDir: (url.searchParams.get('sortDir') as 'asc' | 'desc') || undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      summary: result.summary,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'reporting', permission: 'reports.view', cache: 'private, max-age=30, stale-while-revalidate=60' },
);
