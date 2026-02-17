import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { removeLocationPrice } from '@oppsera/module-catalog';

function extractIds(request: NextRequest): { itemId: string; locationId: string } {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/items/:id/prices/:locationId
  return {
    itemId: parts[parts.length - 3]!,
    locationId: parts[parts.length - 1]!,
  };
}

// DELETE /api/v1/catalog/items/:id/prices/:locationId — remove location price override
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { itemId, locationId } = extractIds(request);
    await removeLocationPrice(ctx, {
      catalogItemId: itemId,
      locationId,
    });
    return new NextResponse(null, { status: 204 });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
