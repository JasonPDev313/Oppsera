import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getInventorySummary } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;
    const belowThresholdOnly = url.searchParams.get('belowThresholdOnly') === 'true';
    const search = url.searchParams.get('search') ?? undefined;
    const sortBy = (url.searchParams.get('sortBy') as 'itemName' | 'onHand') ?? undefined;
    const sortDir = (url.searchParams.get('sortDir') as 'asc' | 'desc') ?? undefined;

    const rows = await getInventorySummary({
      tenantId: ctx.tenantId,
      locationId,
      belowThresholdOnly,
      search,
      sortBy,
      sortDir,
    });

    return NextResponse.json({ data: rows });
  },
  { entitlement: 'reporting', permission: 'reports.view' },
);
