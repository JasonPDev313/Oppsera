import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getMembershipPortfolioReport } from '@oppsera/module-membership';

async function handler(req: NextRequest, ctx: any) {
  const { searchParams } = new URL(req.url);
  const result = await getMembershipPortfolioReport({
    tenantId: ctx.tenantId,
    asOfDate: searchParams.get('asOfDate') ?? undefined,
  });
  return NextResponse.json({ data: result });
}

export const GET = withMiddleware(handler, {
  entitlement: 'club_membership',
  permission: 'club_membership.reports',
});
