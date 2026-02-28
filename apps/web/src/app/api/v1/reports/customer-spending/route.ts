import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCustomerSpending } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;
    const dateFrom = url.searchParams.get('dateFrom') ?? undefined;
    const dateTo = url.searchParams.get('dateTo') ?? undefined;
    const search = url.searchParams.get('search') ?? undefined;
    const sortBy = (url.searchParams.get('sortBy') as 'totalSpend' | 'customerName') ?? undefined;
    const sortDir = (url.searchParams.get('sortDir') as 'asc' | 'desc') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'dateFrom and dateTo are required' } },
        { status: 400 },
      );
    }

    const result = await getCustomerSpending({
      tenantId: ctx.tenantId,
      dateFrom,
      dateTo,
      locationId,
      search,
      sortBy,
      sortDir,
      limit,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'reporting', permission: 'reports.view', cache: 'private, max-age=30, stale-while-revalidate=60' },
);
