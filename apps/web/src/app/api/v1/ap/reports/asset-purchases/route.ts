import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAssetPurchases } from '@oppsera/module-ap';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'startDate and endDate are required' } },
        { status: 400 },
      );
    }
    const result = await getAssetPurchases({ tenantId: ctx.tenantId, startDate, endDate });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.view' },
);
