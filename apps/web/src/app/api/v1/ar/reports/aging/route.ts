import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getArAging } from '@oppsera/module-ar';

// GET /api/v1/ar/reports/aging — AR aging report
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await getArAging({
      tenantId: ctx.tenantId,
      asOfDate: searchParams.get('asOfDate') ?? undefined,
      customerId: searchParams.get('customerId') ?? undefined,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ar', permission: 'ar.view' },
);
