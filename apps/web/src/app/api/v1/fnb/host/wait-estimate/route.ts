import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getWaitTimeEstimate } from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx: any) => {
    const url = new URL(req.url);
    const locationId = url.searchParams.get('locationId') || ctx.locationId;
    const businessDate =
      url.searchParams.get('businessDate') ||
      new Date().toISOString().slice(0, 10);
    const partySizeParam = url.searchParams.get('partySize');
    const partySize = partySizeParam ? parseInt(partySizeParam, 10) : undefined;

    const data = await getWaitTimeEstimate({
      tenantId: ctx.tenantId,
      locationId,
      businessDate,
      partySize,
    });

    return NextResponse.json({ data });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);
