import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core';
import { listTurnoverTasks, createTurnoverTask } from '@oppsera/module-spa';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const result = await listTurnoverTasks({
      tenantId: ctx.tenantId,
      resourceId: url.searchParams.get('resourceId') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      taskType: url.searchParams.get('taskType') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'spa', permission: 'spa.view' },
);

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const result = await createTurnoverTask(ctx, body);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'spa', permission: 'spa.manage' },
);
