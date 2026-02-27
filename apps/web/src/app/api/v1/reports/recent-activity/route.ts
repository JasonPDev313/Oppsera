import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getRecentActivity } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const source = url.searchParams.get('source') ?? undefined;

    const result = await getRecentActivity({
      tenantId: ctx.tenantId,
      locationId,
      limit,
      cursor,
      source,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'reporting', permission: 'reports.view' },
);
