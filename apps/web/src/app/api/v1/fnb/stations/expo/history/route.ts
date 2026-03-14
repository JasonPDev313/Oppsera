import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getExpoHistory } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/expo/history — served tickets for today
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const input = {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!, // guaranteed by requireLocation: true
      businessDate: request.nextUrl.searchParams.get('businessDate') || new Date().toISOString().slice(0, 10),
    };
    const view = await getExpoHistory(input);
    return NextResponse.json({ data: view });
  },
  { entitlement: 'kds', permission: 'kds.view', requireLocation: true },
);
