import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getInventoryItemByCatalogItem } from '@oppsera/module-inventory';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const catalogItemId = url.searchParams.get('catalogItemId');
    if (!catalogItemId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'catalogItemId is required' } },
        { status: 400 },
      );
    }

    const locationId = url.searchParams.get('locationId') ?? ctx.locationId;
    if (!locationId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId is required (pass as query param or X-Location-Id header)' } },
        { status: 400 },
      );
    }
    const result = await getInventoryItemByCatalogItem(ctx.tenantId, catalogItemId, locationId);

    return NextResponse.json({ data: result });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);
