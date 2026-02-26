import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getItemChangeLog } from '@oppsera/module-catalog';
import { parseLimit } from '@/lib/api-params';

function extractItemId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/items/:id/change-log
  return parts[parts.length - 2]!;
}

// GET /api/v1/catalog/items/:id/change-log — paginated change history
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const itemId = extractItemId(request);
    const url = new URL(request.url);

    const result = await getItemChangeLog({
      tenantId: ctx.tenantId,
      itemId,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      actionType: url.searchParams.get('actionType') ?? undefined,
      userId: url.searchParams.get('userId') ?? undefined,
    });

    return NextResponse.json({
      data: result.entries,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'catalog', permission: 'catalog.view' },
);
