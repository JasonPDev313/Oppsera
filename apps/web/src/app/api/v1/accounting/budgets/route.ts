import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listBudgets, createBudget } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listBudgets({
      tenantId: ctx.tenantId,
      fiscalYear: url.searchParams.get('fiscalYear')
        ? Number(url.searchParams.get('fiscalYear'))
        : undefined,
      status: url.searchParams.get('status') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });

    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const { name, fiscalYear, description, locationId } = body;

    if (!name || !fiscalYear) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'name and fiscalYear are required' } },
        { status: 400 },
      );
    }

    const budget = await createBudget(ctx, { name, fiscalYear, description, locationId });
    return NextResponse.json({ data: budget }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
