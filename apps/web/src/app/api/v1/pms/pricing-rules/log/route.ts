import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getPricingLog,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/pricing-rules/log?propertyId=&startDate=&endDate=&roomTypeId?=
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!propertyId || !startDate || !endDate) {
      throw new ValidationError('Missing required parameters', [
        ...(!propertyId ? [{ field: 'propertyId', message: 'required' }] : []),
        ...(!startDate ? [{ field: 'startDate', message: 'required' }] : []),
        ...(!endDate ? [{ field: 'endDate', message: 'required' }] : []),
      ]);
    }

    const data = await getPricingLog(ctx.tenantId, {
      propertyId,
      startDate,
      endDate,
      roomTypeId: url.searchParams.get('roomTypeId') ?? undefined,
    });
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REVENUE_VIEW },
);
