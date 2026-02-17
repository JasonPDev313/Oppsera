import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { deactivateItem } from '@oppsera/module-catalog';

function extractItemId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/items/:id/deactivate
  return parts[parts.length - 2]!;
}

// POST /api/v1/catalog/items/:id/deactivate
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const itemId = extractItemId(request);
    const item = await deactivateItem(ctx, itemId);
    return NextResponse.json({ data: item });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
