import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getActiveGuestPayForTab } from '@oppsera/module-fnb';

// GET /api/v1/fnb/guest-pay/sessions/tab/:tabId/active
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const tabId = segments[segments.length - 2]!; // before /active
    const result = await getActiveGuestPayForTab(ctx.tenantId, tabId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.view' },
);
