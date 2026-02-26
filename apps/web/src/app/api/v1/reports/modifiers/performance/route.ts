import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getModifierPerformance } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
      throw new AppError('VALIDATION_ERROR', 'dateFrom and dateTo are required', 400);
    }

    const rows = await getModifierPerformance({
      tenantId: ctx.tenantId,
      dateFrom,
      dateTo,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
      modifierGroupId: url.searchParams.get('modifierGroupId') ?? undefined,
      catalogItemId: url.searchParams.get('catalogItemId') ?? undefined,
      sortBy: (url.searchParams.get('sortBy') as any) ?? undefined,
      sortDir: (url.searchParams.get('sortDir') as any) ?? undefined,
      limit: Math.min(parseInt(url.searchParams.get('limit') || '') || 50, 100),
    });

    return NextResponse.json({ data: rows });
  },
  { entitlement: 'reporting', permission: 'reports.view', cache: 'private, max-age=60, stale-while-revalidate=120' },
);
