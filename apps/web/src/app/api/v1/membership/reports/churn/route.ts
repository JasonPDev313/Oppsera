import { NextRequest, NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getMembershipChurnReport } from '@oppsera/module-membership';

async function handler(req: NextRequest, ctx: any) {
  const { searchParams } = new URL(req.url);
  const result = await getMembershipChurnReport({
    tenantId: ctx.tenantId,
    riskLevel: searchParams.get('riskLevel') as any ?? undefined,
  });
  return NextResponse.json({ data: result });
}

export const GET = withMiddleware(handler, {
  entitlement: 'club_membership',
  permission: 'club_membership.reports',
});
