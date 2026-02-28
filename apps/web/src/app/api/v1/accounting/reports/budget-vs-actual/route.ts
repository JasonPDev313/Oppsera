import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getBudgetVsActual } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const budgetId = url.searchParams.get('budgetId');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!budgetId || !from || !to) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'budgetId, from, and to are required' } },
        { status: 400 },
      );
    }

    const report = await getBudgetVsActual({
      tenantId: ctx.tenantId,
      budgetId,
      from,
      to,
    });

    if (!report) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Budget not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
