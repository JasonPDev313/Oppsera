import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getKdsLocationCounts } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kitchen/location-counts?locationIds=id1,id2,...
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const raw = url.searchParams.get('locationIds') ?? '';
    const locationIds = raw.split(',').filter(Boolean);

    if (locationIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const counts = await getKdsLocationCounts(ctx.tenantId, locationIds);
    return NextResponse.json({ data: counts });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
