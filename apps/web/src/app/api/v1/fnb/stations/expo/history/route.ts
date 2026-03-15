import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getExpoHistory, resolveKdsLocationId } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/expo/history — served tickets for today
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const kdsLoc = await resolveKdsLocationId(ctx.tenantId, ctx.locationId!);
    const input = {
      tenantId: ctx.tenantId,
      locationId: kdsLoc.locationId,
      businessDate: request.nextUrl.searchParams.get('businessDate') || new Date().toISOString().slice(0, 10),
    };
    const view = await getExpoHistory(input);
    return NextResponse.json({ data: view });
  },
  { entitlement: 'kds', permission: 'kds.view', requireLocation: true },
);
