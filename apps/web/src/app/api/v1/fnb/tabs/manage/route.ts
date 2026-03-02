import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listTabsForManage, manageTabsQuerySchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/tabs/manage — list tabs for management
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const input = manageTabsQuerySchema.parse({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
      businessDate: url.searchParams.get('businessDate') ?? undefined,
      serverUserId: url.searchParams.get('serverUserId') ?? undefined,
      statuses: url.searchParams.get('statuses')?.split(',').filter(Boolean) ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      sortBy: url.searchParams.get('sortBy') ?? undefined,
      includeAmounts: url.searchParams.get('includeAmounts') === 'true',
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });

    const result = await listTabsForManage(input);
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage' },
);
