import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTableAvailability } from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const locationId = url.searchParams.get('locationId') || ctx.locationId || '';
    const partySizeParam = url.searchParams.get('partySize');
    const partySize = partySizeParam ? parseInt(partySizeParam, 10) : 2;
    const seatingPreference =
      url.searchParams.get('seatingPreference') || undefined;
    const reservationDate =
      url.searchParams.get('reservationDate') || undefined;
    const reservationTime =
      url.searchParams.get('reservationTime') || undefined;

    const data = await getTableAvailability({
      tenantId: ctx.tenantId,
      locationId,
      partySize,
      seatingPreference: seatingPreference as any,
      reservationDate,
      reservationTime,
    });

    return NextResponse.json({ data });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.view' },
);
