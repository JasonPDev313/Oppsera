import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  PMS_PERMISSIONS,
  suggestAvailableRooms,
} from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request, ctx) => {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const roomTypeId = searchParams.get('roomTypeId');
    const checkInDate = searchParams.get('checkInDate');
    const checkOutDate = searchParams.get('checkOutDate');
    if (!propertyId || !roomTypeId || !checkInDate || !checkOutDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'propertyId, roomTypeId, checkInDate, and checkOutDate are required' } },
        { status: 400 },
      );
    }
    const result = await suggestAvailableRooms(
      ctx.tenantId,
      propertyId,
      roomTypeId,
      checkInDate,
      checkOutDate,
    );
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.RESERVATIONS_VIEW, entitlement: 'pms' },
);
