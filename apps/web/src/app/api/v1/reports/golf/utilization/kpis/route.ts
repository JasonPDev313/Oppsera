import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getTeeSheetKpis } from '@oppsera/module-golf-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
      throw new AppError('VALIDATION_ERROR', 'dateFrom and dateTo are required', 400);
    }

    const courseId = url.searchParams.get('courseId') ?? undefined;
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;

    const kpis = await getTeeSheetKpis({
      tenantId: ctx.tenantId,
      courseId,
      locationId,
      dateFrom,
      dateTo,
    });

    return NextResponse.json({ data: kpis });
  },
  { entitlement: 'reporting', permission: 'reports.view' },
);
