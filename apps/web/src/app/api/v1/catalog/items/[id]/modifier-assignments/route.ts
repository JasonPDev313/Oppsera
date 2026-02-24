import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getItemModifierAssignments } from '@oppsera/module-catalog';

function extractItemId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/items/:id/modifier-assignments
  return parts[parts.length - 2]!;
}

// GET /api/v1/catalog/items/:id/modifier-assignments — get all modifier group assignments for an item
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const itemId = extractItemId(request);
    const assignments = await getItemModifierAssignments(ctx.tenantId, itemId);
    return NextResponse.json({ data: assignments });
  },
  { entitlement: 'catalog', permission: 'catalog.view' },
);
