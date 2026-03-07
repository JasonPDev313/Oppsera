import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCashFlowStatement } from '@oppsera/module-accounting';

// GET /api/v1/accounting/statements/cash-flow — cash flow statement (indirect method)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!from || !to || !dateRegex.test(from) || !dateRegex.test(to)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'from and to are required in YYYY-MM-DD format' } },
        { status: 400 },
      );
    }

    const report = await getCashFlowStatement({
      tenantId: ctx.tenantId,
      from,
      to,
    });

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
