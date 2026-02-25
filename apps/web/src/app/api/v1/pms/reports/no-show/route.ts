import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getNoShowReport, PMS_PERMISSIONS } from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

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

    const result = await getNoShowReport(ctx.tenantId, propertyId, startDate, endDate);
    // Unwrap items and map fields to frontend NoShowRecord interface
    const data = result.items.map((row) => ({
      reservationId: row.reservationId,
      guestName: row.guestName,
      roomTypeName: row.roomTypeName,
      checkInDate: row.checkInDate,
      nightlyRateCents: row.nightCount > 0
        ? Math.round(row.estimatedRevenueCents / row.nightCount)
        : 0,
      lostRevenueCents: row.estimatedRevenueCents,
    }));
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REPORTS_VIEW },
);
