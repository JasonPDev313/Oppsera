import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hostGetUpcomingReservations } from '@oppsera/module-fnb';
import { parseLimit } from '@/lib/api-params';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get('limit'), 100, 20);
    const result = await hostGetUpcomingReservations({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId || '',
      limit,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.view' },
);
