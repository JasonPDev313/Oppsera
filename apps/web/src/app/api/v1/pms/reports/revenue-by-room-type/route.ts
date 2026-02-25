import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getRevenueByRoomType, PMS_PERMISSIONS } from '@oppsera/module-pms';
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

    const rows = await getRevenueByRoomType(ctx.tenantId, propertyId, startDate, endDate);
    // Map backend fields to frontend RevenueByRoomType interface
    const data = rows.map((row) => ({
      roomTypeId: row.roomTypeId,
      roomTypeName: row.roomTypeName,
      roomNights: row.roomsSold,
      revenueCents: row.roomRevenueCents,
      adrCents: row.adrCents,
      occupancyPct: row.totalRoomInventory > 0
        ? Math.round((row.roomsSold / row.totalRoomInventory) * 10000) / 100
        : 0,
    }));
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REPORTS_VIEW },
);
