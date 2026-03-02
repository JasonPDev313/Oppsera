import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getStationMetrics } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/[id]/metrics — get station performance metrics
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const stationId = parts[parts.length - 2]!;
    const url = new URL(request.url);

    const metrics = await getStationMetrics({
      tenantId: ctx.tenantId,
      stationId,
      businessDate: url.searchParams.get('businessDate') ?? '',
    });
    return NextResponse.json({ data: metrics });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
