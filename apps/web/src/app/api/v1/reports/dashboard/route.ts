import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getDashboardMetrics } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;
    const date = url.searchParams.get('date') ?? undefined;

    const metrics = await getDashboardMetrics({
      tenantId: ctx.tenantId,
      locationId,
      date,
    });

    return NextResponse.json({ data: metrics });
  },
  { entitlement: 'reporting', permission: 'reports.view' },
);
