import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getModifierGroupItemHeatmap } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
      throw new AppError('VALIDATION_ERROR', 'dateFrom and dateTo are required', 400);
    }

    const rows = await getModifierGroupItemHeatmap({
      tenantId: ctx.tenantId,
      dateFrom,
      dateTo,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
    });

    return NextResponse.json({ data: rows });
  },
  { entitlement: 'reporting', permission: 'reports.view', cache: 'private, max-age=60, stale-while-revalidate=120' },
);
