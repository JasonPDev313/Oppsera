import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getItemSales } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
      throw new AppError('VALIDATION_ERROR', 'dateFrom and dateTo are required', 400);
    }

    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;
    const sortBy = (url.searchParams.get('sortBy') as 'quantitySold' | 'grossRevenue') ?? undefined;
    const sortDir = (url.searchParams.get('sortDir') as 'asc' | 'desc') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : undefined;

    const rows = await getItemSales({
      tenantId: ctx.tenantId,
      locationId,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,
      limit,
    });

    return NextResponse.json({ data: rows });
  },
  { entitlement: 'reporting', permission: 'reports.view', cache: 'private, max-age=60, stale-while-revalidate=120' },
);
