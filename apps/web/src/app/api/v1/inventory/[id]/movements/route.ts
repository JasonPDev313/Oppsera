import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getMovements } from '@oppsera/module-inventory';

function extractItemId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/inventory/{id}/movements → id is parts[parts.length - 2]
  return parts[parts.length - 2]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const inventoryItemId = extractItemId(request);
    const url = new URL(request.url);
    const result = await getMovements({
      tenantId: ctx.tenantId,
      inventoryItemId,
      movementType: url.searchParams.get('movementType') ?? undefined,
      source: url.searchParams.get('source') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? Math.min(parseInt(url.searchParams.get('limit')!, 10), 100) || undefined : undefined,
    });
    return NextResponse.json({
      data: result.movements,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);
