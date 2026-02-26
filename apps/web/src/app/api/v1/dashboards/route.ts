import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { parseLimit } from '@/lib/api-params';
import { listDashboards, saveDashboard } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = parseLimit(url.searchParams.get('limit'));

    const result = await listDashboards({ tenantId: ctx.tenantId, cursor, limit });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'reporting', permission: 'reports.custom.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    if (!body.name || !body.tiles) {
      throw new AppError('VALIDATION_ERROR', 'name and tiles are required', 400);
    }

    const result = await saveDashboard(ctx, {
      name: body.name,
      description: body.description,
      tiles: body.tiles,
      isDefault: body.isDefault,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'reporting', permission: 'reports.custom.manage' , writeAccess: true },
);
