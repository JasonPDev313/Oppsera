import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getUnrealizedGainLoss } from '@oppsera/module-accounting';

// GET /api/v1/accounting/currencies/unrealized-gain-loss — FX revaluation report
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const asOfDate = url.searchParams.get('asOfDate');

    if (!asOfDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'asOfDate query parameter is required' } },
        { status: 400 },
      );
    }

    const report = await getUnrealizedGainLoss({
      tenantId: ctx.tenantId,
      asOfDate,
    });

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
