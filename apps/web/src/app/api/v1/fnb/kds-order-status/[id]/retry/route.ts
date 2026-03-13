import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { retryKdsSend } from '@oppsera/module-fnb';

// POST /api/v1/fnb/kds-order-status/[id]/retry — retry a failed KDS send
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const sendId = parts[parts.indexOf('kds-order-status') + 1]!;
    const result = await retryKdsSend(ctx, sendId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'kds', permission: 'kds.manage', writeAccess: true, requireLocation: true },
);
