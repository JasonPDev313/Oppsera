import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getTaxRateBreakdown } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
      throw new AppError('VALIDATION_ERROR', 'dateFrom and dateTo are required', 400);
    }

    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;

    const report = await getTaxRateBreakdown({
      tenantId: ctx.tenantId,
      from: dateFrom,
      to: dateTo,
      locationId,
    });

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'reports.view' },
);
