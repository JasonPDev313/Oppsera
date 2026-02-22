import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getDrawerSessionSummary } from '@oppsera/core/drawer-sessions';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // URL: /api/v1/drawer-sessions/[id]
  return parts[parts.length - 1]!;
}

// GET /api/v1/drawer-sessions/[id] — Get drawer session summary (with events + sales aggregates)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);

    const summary = await getDrawerSessionSummary({
      tenantId: ctx.tenantId,
      drawerSessionId: id,
    });

    return NextResponse.json({ data: summary });
  },
  { entitlement: 'orders', permission: 'shift.manage' },
);
