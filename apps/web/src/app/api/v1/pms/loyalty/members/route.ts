import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getLoyaltyMember, PMS_PERMISSIONS } from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const guestId = searchParams.get('guestId');
    if (!guestId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'guestId query param is required' } },
        { status: 400 },
      );
    }
    const member = await getLoyaltyMember(ctx.tenantId, guestId);
    if (!member) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Loyalty member not found for this guest' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: member });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.LOYALTY_VIEW },
);
