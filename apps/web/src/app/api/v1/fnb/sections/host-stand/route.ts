import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getHostStandView } from '@oppsera/module-fnb';

// GET /api/v1/fnb/sections/host-stand — host stand view
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = ctx.locationId ?? url.searchParams.get('locationId');
    const businessDate = url.searchParams.get('businessDate');

    if (!locationId) {
      throw new AppError('BAD_REQUEST', 'locationId is required', 400);
    }
    if (!businessDate) {
      throw new AppError('BAD_REQUEST', 'businessDate is required', 400);
    }

    const result = await getHostStandView({
      tenantId: ctx.tenantId,
      locationId,
      businessDate,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);
