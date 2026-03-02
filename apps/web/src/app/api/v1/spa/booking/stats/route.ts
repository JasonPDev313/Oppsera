import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getOnlineBookingStats } from '@oppsera/module-spa';

// GET /api/v1/spa/booking/stats — online booking KPIs
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const stats = await getOnlineBookingStats({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    return NextResponse.json({ data: stats });
  },
  { entitlement: 'spa', permission: 'spa.booking.view' },
);
