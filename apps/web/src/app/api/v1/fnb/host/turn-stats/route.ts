import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hostGetTableTurnStats } from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get('days') || '28');
    const result = await hostGetTableTurnStats({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId || '',
      days,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.view' },
);
