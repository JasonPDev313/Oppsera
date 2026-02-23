import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getMembershipPredictiveInsights } from '@oppsera/module-membership';

async function handler(_req: NextRequest, ctx: any) {
  const result = await getMembershipPredictiveInsights({ tenantId: ctx.tenantId });
  return NextResponse.json({ data: result });
}

export const GET = withMiddleware(handler, {
  entitlement: 'club_membership',
  permission: 'club_membership.reports',
});
