import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getActiveFolioForGuest, PMS_PERMISSIONS } from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    // URL: /api/v1/pms/pos/guests/[guestId]/folio → guestId is second-to-last
    const guestId = parts[parts.length - 2]!;

    const folio = await getActiveFolioForGuest(ctx.tenantId, guestId);
    if (!folio) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No active folio for this guest' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: folio });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.GUESTS_VIEW },
);
