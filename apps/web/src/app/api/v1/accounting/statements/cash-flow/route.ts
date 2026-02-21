import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCashFlowSimplified } from '@oppsera/module-accounting';

// GET /api/v1/accounting/statements/cash-flow — simplified cash flow statement
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'from and to are required' } },
        { status: 400 },
      );
    }

    const report = await getCashFlowSimplified({
      tenantId: ctx.tenantId,
      from,
      to,
    });

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
