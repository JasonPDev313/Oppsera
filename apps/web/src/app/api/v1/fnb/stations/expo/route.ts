import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getExpoView } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/expo — get expo view (all stations)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const view = await getExpoView({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? '',
      businessDate: url.searchParams.get('businessDate') ?? '',
    });
    return NextResponse.json({ data: view });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.view' },
);
