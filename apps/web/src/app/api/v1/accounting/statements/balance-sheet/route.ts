import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getBalanceSheet } from '@oppsera/module-accounting';

// GET /api/v1/accounting/statements/balance-sheet — balance sheet as of date
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const asOfDate = url.searchParams.get('asOfDate');

    if (!asOfDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'asOfDate is required' } },
        { status: 400 },
      );
    }

    const report = await getBalanceSheet({
      tenantId: ctx.tenantId,
      asOfDate,
      locationId: url.searchParams.get('locationId') ?? undefined,
    });

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
