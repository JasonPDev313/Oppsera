import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getHostDashboard } from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const locationId = url.searchParams.get('locationId') || ctx.locationId || '';
    const businessDate =
      url.searchParams.get('businessDate') ||
      new Date().toISOString().slice(0, 10);

    if (!locationId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId is required' } },
        { status: 400 },
      );
    }

    const data = await getHostDashboard({
      tenantId: ctx.tenantId,
      locationId,
      businessDate,
    });

    return NextResponse.json({ data });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.view' },
);
