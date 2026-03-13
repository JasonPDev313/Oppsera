import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getKdsSendDetail } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds-order-status/[id] — get full send detail with timeline
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const sendId = parts[parts.indexOf('kds-order-status') + 1]!;
    const detail = await getKdsSendDetail(ctx.tenantId, ctx.locationId!, sendId);
    if (!detail) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Send record not found' } }, { status: 404 });
    }
    return NextResponse.json({ data: detail });
  },
  { entitlement: 'kds', permission: 'kds.manage', requireLocation: true },
);
