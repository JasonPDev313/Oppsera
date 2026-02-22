import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getCogsComparison } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const periodStart = url.searchParams.get('periodStart');
    const periodEnd = url.searchParams.get('periodEnd');

    if (!periodStart || !periodEnd) {
      throw new AppError('VALIDATION_ERROR', 'periodStart and periodEnd are required', 400);
    }

    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;

    const result = await getCogsComparison(ctx.tenantId, periodStart, periodEnd, locationId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'cogs.manage' },
);
