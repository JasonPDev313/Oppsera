import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getWaitlistStats, PMS_PERMISSIONS } from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    if (!propertyId) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'propertyId is required' } }, { status: 400 });
    }

    const stats = await getWaitlistStats({
      tenantId: ctx.tenantId,
      propertyId,
      roomTypeId: url.searchParams.get('roomTypeId') ?? undefined,
    });

    return NextResponse.json({ data: stats });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.WAITLIST_VIEW },
);
