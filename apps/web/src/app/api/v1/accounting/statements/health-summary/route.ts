import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getFinancialHealthSummary } from '@oppsera/module-accounting';

// GET /api/v1/accounting/statements/health-summary — financial health dashboard KPIs
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const asOfDate = url.searchParams.get('asOfDate') ?? new Date().toISOString().substring(0, 10);

    const summary = await getFinancialHealthSummary({
      tenantId: ctx.tenantId,
      asOfDate,
    });

    return NextResponse.json({ data: summary });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
