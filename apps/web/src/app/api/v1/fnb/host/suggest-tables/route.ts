import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { suggestTables } from '@oppsera/module-fnb';

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const result = await suggestTables({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId || '',
      partySize: Number(body.partySize),
      seatingPreference: body.seatingPreference,
      isVip: body.isVip,
      customerId: body.customerId,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.manage' },
);
