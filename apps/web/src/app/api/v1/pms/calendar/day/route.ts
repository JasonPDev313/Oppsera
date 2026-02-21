import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  PMS_PERMISSIONS,
  getCalendarDay,
} from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request, ctx) => {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const date = searchParams.get('date');
    if (!propertyId || !date) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'propertyId and date are required' } },
        { status: 400 },
      );
    }
    const result = await getCalendarDay(ctx.tenantId, propertyId, date);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.CALENDAR_VIEW, entitlement: 'pms' },
);
