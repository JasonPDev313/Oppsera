import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { searchItemsForReceiving } from '@oppsera/module-inventory';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') ?? '';
    const locationId = url.searchParams.get('locationId') ?? ctx.locationId;
    const vendorId = url.searchParams.get('vendorId') ?? undefined;

    if (!locationId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'locationId is required' } },
        { status: 400 },
      );
    }
    if (!query) {
      return NextResponse.json({ data: [] });
    }

    const results = await searchItemsForReceiving(ctx.tenantId, locationId, query, vendorId);
    return NextResponse.json({ data: results });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);
