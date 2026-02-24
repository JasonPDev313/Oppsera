import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listGuestPaySessionsForTab } from '@oppsera/module-fnb';

// GET /api/v1/fnb/guest-pay/sessions/tab/:tabId
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const tabId = url.pathname.split('/').pop()!;
    const result = await listGuestPaySessionsForTab(ctx.tenantId, tabId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.view' },
);
