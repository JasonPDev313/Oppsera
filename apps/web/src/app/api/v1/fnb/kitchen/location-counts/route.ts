import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getKdsLocationCounts, resolveKdsLocationId } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kitchen/location-counts?locationIds=id1,id2,...
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const raw = url.searchParams.get('locationIds') ?? '';
    const rawIds = raw.split(',').filter(Boolean);

    if (rawIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Resolve site IDs → venue IDs so counts match KDS station locations
    const resolved = await Promise.all(
      rawIds.map((id) => resolveKdsLocationId(ctx.tenantId, id)),
    );
    const locationIds = [...new Set(resolved.map((r) => r.locationId))];

    const counts = await getKdsLocationCounts(ctx.tenantId, locationIds);
    return NextResponse.json({ data: counts });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
