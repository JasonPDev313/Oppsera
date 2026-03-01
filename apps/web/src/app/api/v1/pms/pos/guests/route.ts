import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { searchCheckedInGuestsForPOS, PMS_PERMISSIONS } from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (_req, ctx) => {
    const url = new URL(_req.url);
    const q = url.searchParams.get('q') ?? '';
    const locationId = url.searchParams.get('locationId') ?? undefined;

    if (!q || q.length < 2) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Query must be at least 2 characters' } },
        { status: 400 },
      );
    }

    const guests = await searchCheckedInGuestsForPOS(ctx.tenantId, q, locationId);
    return NextResponse.json({ data: guests });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.GUESTS_VIEW },
);
