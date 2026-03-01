import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getFolioSummaryForPOS, PMS_PERMISSIONS } from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const folioId = new URL(request.url).pathname.split('/').pop()!;

    const folio = await getFolioSummaryForPOS(ctx.tenantId, folioId);
    if (!folio) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Folio not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: folio });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.GUESTS_VIEW },
);
