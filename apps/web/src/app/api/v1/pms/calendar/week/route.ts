import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  PMS_PERMISSIONS,
  getCalendarWeek,
} from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request, ctx) => {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const start = searchParams.get('start');
    if (!propertyId || !start) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'propertyId and start are required' } },
        { status: 400 },
      );
    }
    const result = await getCalendarWeek(ctx.tenantId, propertyId, start);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.CALENDAR_VIEW, entitlement: 'pms' },
);
