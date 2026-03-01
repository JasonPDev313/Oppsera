import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCheckedInGuestByRoom, PMS_PERMISSIONS } from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (_req, ctx) => {
    const url = new URL(_req.url);
    const room = url.searchParams.get('room') ?? '';
    const locationId = url.searchParams.get('locationId') ?? undefined;

    if (!room) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'room parameter is required' } },
        { status: 400 },
      );
    }

    const guest = await getCheckedInGuestByRoom(ctx.tenantId, room, locationId);
    if (!guest) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No checked-in guest in room ${room}` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: guest });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.GUESTS_VIEW },
);
