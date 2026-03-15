import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getKdsStationCounts, resolveKdsLocationId } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kitchen/station-counts?locationId=...
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const rawLocationId = url.searchParams.get('locationId') ?? '';

    if (!rawLocationId) {
      return NextResponse.json({ data: [] });
    }

    const kdsLoc = await resolveKdsLocationId(ctx.tenantId, rawLocationId);
    const counts = await getKdsStationCounts(ctx.tenantId, kdsLoc.locationId);
    return NextResponse.json({ data: counts });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
