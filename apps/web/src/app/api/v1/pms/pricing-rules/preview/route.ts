import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  previewPricing,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/pricing-rules/preview?propertyId=&startDate=&endDate=&roomTypeId?=
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

    const data = await previewPricing(
      ctx.tenantId,
      propertyId,
      startDate,
      endDate,
      url.searchParams.get('roomTypeId') ?? undefined,
    );
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REVENUE_VIEW },
);
