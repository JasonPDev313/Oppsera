import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getKdsStationCounts } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kitchen/station-counts?locationId=...
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId') ?? '';

    if (!locationId) {
      return NextResponse.json({ data: [] });
    }

    const counts = await getKdsStationCounts(ctx.tenantId, locationId);
    return NextResponse.json({ data: counts });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
