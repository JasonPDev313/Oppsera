import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getCalendarMonth, PMS_PERMISSIONS } from '@oppsera/module-pms';

// GET /api/v1/pms/calendar/month?propertyId=&year=&month=
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    const yearStr = url.searchParams.get('year');
    const monthStr = url.searchParams.get('month');

    if (!propertyId || !yearStr || !monthStr) {
      throw new ValidationError('propertyId, year, and month are required', [
        ...(!propertyId ? [{ field: 'propertyId', message: 'required' }] : []),
        ...(!yearStr ? [{ field: 'year', message: 'required' }] : []),
        ...(!monthStr ? [{ field: 'month', message: 'required' }] : []),
      ]);
    }

    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new ValidationError('Invalid year or month', [
        { field: 'year', message: 'must be a valid year' },
        { field: 'month', message: 'must be 1-12' },
      ]);
    }

    const data = await getCalendarMonth(ctx.tenantId, propertyId, year, month);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CALENDAR_VIEW },
);
