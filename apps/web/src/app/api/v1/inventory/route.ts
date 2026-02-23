import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listInventoryItems } from '@oppsera/module-inventory';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listInventoryItems({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? ctx.locationId,
      status: url.searchParams.get('status') ?? undefined,
      itemType: url.searchParams.get('itemType') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      lowStockOnly: url.searchParams.get('lowStockOnly') === 'true',
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? Math.min(parseInt(url.searchParams.get('limit')!, 10), 100) || undefined : undefined,
    });
    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);
