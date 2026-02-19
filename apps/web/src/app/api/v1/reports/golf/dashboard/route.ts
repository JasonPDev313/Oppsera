import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGolfDashboardMetrics } from '@oppsera/module-golf-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const courseId = url.searchParams.get('courseId') ?? undefined;
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;
    const date = url.searchParams.get('date') ?? undefined;

    const metrics = await getGolfDashboardMetrics({
      tenantId: ctx.tenantId,
      courseId,
      locationId,
      date,
    });

    return NextResponse.json({ data: metrics });
  },
  { entitlement: 'reporting', permission: 'reports.view' },
);
