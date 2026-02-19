import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { unarchiveItem } from '@oppsera/module-catalog';

function extractItemId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/items/:id/unarchive
  return parts[parts.length - 2]!;
}

// POST /api/v1/catalog/items/:id/unarchive
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const itemId = extractItemId(request);
    const item = await unarchiveItem(ctx, itemId);
    return NextResponse.json({ data: item });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
