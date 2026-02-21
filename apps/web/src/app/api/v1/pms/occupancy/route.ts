import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  PMS_PERMISSIONS,
  getDailyOccupancy,
} from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request, ctx) => {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (!propertyId || !startDate || !endDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'propertyId, startDate, and endDate are required' } },
        { status: 400 },
      );
    }
    const result = await getDailyOccupancy(ctx.tenantId, propertyId, startDate, endDate);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.CALENDAR_VIEW, entitlement: 'pms' },
);
