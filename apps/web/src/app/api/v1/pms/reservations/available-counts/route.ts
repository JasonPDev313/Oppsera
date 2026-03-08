import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  PMS_PERMISSIONS,
  countAvailableRoomsByType,
} from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request, ctx) => {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const checkInDate = searchParams.get('checkInDate');
    const checkOutDate = searchParams.get('checkOutDate');
    if (!propertyId || !checkInDate || !checkOutDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'propertyId, checkInDate, and checkOutDate are required' } },
        { status: 400 },
      );
    }
    const result = await countAvailableRoomsByType(
      ctx.tenantId,
      propertyId,
      checkInDate,
      checkOutDate,
    );
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.RESERVATIONS_VIEW, entitlement: 'pms' },
);
