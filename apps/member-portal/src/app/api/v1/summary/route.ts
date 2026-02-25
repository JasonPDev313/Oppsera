import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';
import { getMemberPortalSummary } from '@oppsera/module-membership';

export const GET = withPortalAuth(async (_request: NextRequest, { session }) => {
  const summary = await getMemberPortalSummary({
    tenantId: session.tenantId,
    customerId: session.customerId,
  });

  return NextResponse.json({ data: summary });
});
