import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getLocationCloseStatus } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId');
    const businessDate = url.searchParams.get('businessDate');

    if (!locationId || !businessDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId and businessDate are required' } },
        { status: 400 },
      );
    }

    const result = await getLocationCloseStatus(ctx.tenantId, locationId, businessDate);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
