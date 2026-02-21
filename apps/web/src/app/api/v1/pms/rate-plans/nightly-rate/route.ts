import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getNightlyRate } from '@oppsera/module-pms';

// GET /api/v1/pms/rate-plans/nightly-rate?ratePlanId=X&roomTypeId=Y&date=Z
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const ratePlanId = searchParams.get('ratePlanId');
    const roomTypeId = searchParams.get('roomTypeId');
    const date = searchParams.get('date');

    if (!ratePlanId || !roomTypeId || !date) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'ratePlanId, roomTypeId, and date are required' } },
        { status: 400 },
      );
    }

    const result = await getNightlyRate(ctx.tenantId, ratePlanId, roomTypeId, date);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: 'pms.rates.view' },
);
