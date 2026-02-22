import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getDeferredRevenueSchedule } from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const accountId = url.searchParams.get('accountId') ?? undefined;
    const asOfDate = url.searchParams.get('asOfDate') ?? undefined;

    const result = await getDeferredRevenueSchedule({
      tenantId: ctx.tenantId,
      membershipAccountId: accountId,
      asOfDate,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.reports' },
);
