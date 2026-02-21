import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getApAging } from '@oppsera/module-ap';

// GET /api/v1/ap/aging — get AP aging report
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await getApAging({
      tenantId: ctx.tenantId,
      asOfDate: searchParams.get('asOfDate') ?? undefined,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.view' },
);
