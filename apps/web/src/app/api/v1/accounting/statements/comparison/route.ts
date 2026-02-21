import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getPeriodComparison } from '@oppsera/module-accounting';

// GET /api/v1/accounting/statements/comparison — period-over-period comparison
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const currentFrom = url.searchParams.get('currentFrom');
    const currentTo = url.searchParams.get('currentTo');
    const priorFrom = url.searchParams.get('priorFrom');
    const priorTo = url.searchParams.get('priorTo');

    if (!currentFrom || !currentTo || !priorFrom || !priorTo) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'currentFrom, currentTo, priorFrom, priorTo are required' } },
        { status: 400 },
      );
    }

    const report = await getPeriodComparison({
      tenantId: ctx.tenantId,
      currentFrom,
      currentTo,
      priorFrom,
      priorTo,
    });

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
