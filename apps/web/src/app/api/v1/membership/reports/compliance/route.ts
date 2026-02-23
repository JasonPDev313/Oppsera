import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getMembershipComplianceReport } from '@oppsera/module-membership';

async function handler(req: NextRequest, ctx: any) {
  const { searchParams } = new URL(req.url);
  const periodKey = searchParams.get('periodKey');
  if (!periodKey) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'periodKey is required' } }, { status: 400 });
  }
  const result = await getMembershipComplianceReport({ tenantId: ctx.tenantId, periodKey });
  return NextResponse.json({ data: result });
}

export const GET = withMiddleware(handler, {
  entitlement: 'club_membership',
  permission: 'club_membership.reports',
});
