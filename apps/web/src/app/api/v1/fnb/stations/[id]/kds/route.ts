import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getKdsView, getKdsHistory } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/[id]/kds — get KDS view for station
// ?view=history returns completed/bumped tickets with full item details
// NOTE: Expo stations are rejected by getKdsView — use /api/v1/fnb/stations/expo instead.
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const stationId = parts[parts.length - 2]!;

    const input = {
      tenantId: ctx.tenantId,
      stationId,
      locationId: ctx.locationId!, // guaranteed by requireLocation: true
      businessDate: request.nextUrl.searchParams.get('businessDate') || new Date().toISOString().slice(0, 10),
    };

    const viewParam = request.nextUrl.searchParams.get('view');
    if (viewParam === 'history') {
      const history = await getKdsHistory(input);
      return NextResponse.json({ data: history });
    }

    const view = await getKdsView(input);
    return NextResponse.json({ data: view });
  },
  { entitlement: 'kds', permission: 'kds.view', requireLocation: true },
);
