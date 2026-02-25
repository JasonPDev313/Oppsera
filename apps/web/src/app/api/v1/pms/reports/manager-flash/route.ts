import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getManagerFlashReport, PMS_PERMISSIONS } from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    const businessDate = url.searchParams.get('businessDate');

    if (!propertyId || !businessDate) {
      throw new ValidationError('Missing required parameters', [
        ...(!propertyId ? [{ field: 'propertyId', message: 'required' }] : []),
        ...(!businessDate ? [{ field: 'businessDate', message: 'required' }] : []),
      ]);
    }

    const report = await getManagerFlashReport(ctx.tenantId, propertyId, businessDate);
    // Map backend fields to frontend ManagerFlash interface
    const data = {
      businessDate: report.businessDate,
      totalRooms: report.totalRooms,
      roomsOccupied: report.occupiedRooms,
      occupancyPct: report.occupancyPct,
      adrCents: report.adrCents,
      revParCents: report.revParCents,
      roomRevenueCents: report.totalRevenueCents,
      arrivals: report.arrivals,
      departures: report.departures,
      stayovers: report.stayovers,
      oooRooms: report.outOfOrder,
    };
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REPORTS_VIEW },
);
