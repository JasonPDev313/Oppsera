import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCheckSummary } from '@oppsera/module-fnb';

// GET /api/v1/fnb/tabs/:id/check — get check summary for tab's order
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const _tabId = parts[parts.length - 2]!;
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'orderId query param required' } },
        { status: 400 },
      );
    }

    const summary = await getCheckSummary({ tenantId: ctx.tenantId, orderId });
    if (!summary) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Check not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: summary });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.view' },
);
