import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hostGetWaitlistStats } from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const result = await hostGetWaitlistStats({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId || '',
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.view' },
);
