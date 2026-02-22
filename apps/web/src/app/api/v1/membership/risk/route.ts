import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getRiskDashboard } from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const result = await getRiskDashboard({
      tenantId: ctx.tenantId,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);
