import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getKdsView } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/[id]/kds — get KDS view for station
// NOTE: Expo stations are rejected by getKdsView — use /api/v1/fnb/stations/expo instead.
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const stationId = parts[parts.length - 2]!;
    const url = new URL(request.url);

    const view = await getKdsView({
      tenantId: ctx.tenantId,
      stationId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? '',
      businessDate: url.searchParams.get('businessDate') || new Date().toISOString().slice(0, 10), // UTC fallback — client should always send businessDate
    });

    return NextResponse.json({ data: view });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
