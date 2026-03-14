import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTrialBalance } from '@oppsera/module-accounting';

// GET /api/v1/accounting/reports/trial-balance — trial balance report
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const report = await getTrialBalance({
      tenantId: ctx.tenantId,
      startDate: url.searchParams.get('startDate') ?? undefined,
      endDate: url.searchParams.get('endDate') ?? undefined,
      asOfDate: url.searchParams.get('asOfDate') ?? undefined,
      locationId: url.searchParams.get('locationId') ?? undefined,
      showZeroBalances: url.searchParams.get('showZeroBalances') === 'true',
    });

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
