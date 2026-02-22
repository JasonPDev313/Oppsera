import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getMinimumComplianceDashboard } from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const dashboard = await getMinimumComplianceDashboard({
      tenantId: ctx.tenantId,
      periodStart: url.searchParams.get('periodStart') ?? undefined,
      periodEnd: url.searchParams.get('periodEnd') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    });

    return NextResponse.json({ data: dashboard });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);
