import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { get1099Report } from '@oppsera/module-ap';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : new Date().getFullYear();
    const result = await get1099Report({ tenantId: ctx.tenantId, year });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.view' },
);
