import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getBudget, updateBudget } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const budget = await getBudget({ tenantId: ctx.tenantId, budgetId: id });

    if (!budget) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Budget not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: budget });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const updated = await updateBudget(ctx, { budgetId: id, ...body });
    return NextResponse.json({ data: updated });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
