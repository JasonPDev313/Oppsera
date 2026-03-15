import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getKdsAllTickets, resolveKdsLocationId } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kitchen/all — get all active KDS tickets across all stations
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const rawLocationId = ctx.locationId ?? url.searchParams.get('locationId') ?? '';
    const businessDate = url.searchParams.get('businessDate') || new Date().toISOString().slice(0, 10);

    let locationId = rawLocationId;
    if (rawLocationId) {
      const kdsLoc = await resolveKdsLocationId(ctx.tenantId, rawLocationId);
      locationId = kdsLoc.locationId;
    }

    const view = await getKdsAllTickets({
      tenantId: ctx.tenantId,
      locationId,
      businessDate,
    });

    return NextResponse.json({ data: view });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
