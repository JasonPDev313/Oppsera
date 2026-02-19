import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { listReports, saveReport } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined;

    const result = await listReports({ tenantId: ctx.tenantId, cursor, limit });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'reporting', permission: 'reports.custom.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    if (!body.name || !body.dataset || !body.definition) {
      throw new AppError('VALIDATION_ERROR', 'name, dataset, and definition are required', 400);
    }

    const result = await saveReport(ctx, {
      name: body.name,
      description: body.description,
      dataset: body.dataset,
      definition: body.definition,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'reporting', permission: 'reports.custom.manage' },
);
