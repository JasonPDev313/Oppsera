import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';
import { getMinimumProgress } from '@oppsera/module-membership';

export const GET = withPortalAuth(async (request: NextRequest, { session }) => {
  const url = new URL(request.url);

  const progress = await getMinimumProgress({
    tenantId: session.tenantId,
    customerId: session.customerId,
    periodStart: url.searchParams.get('periodStart') ?? undefined,
    periodEnd: url.searchParams.get('periodEnd') ?? undefined,
  });

  return NextResponse.json({ data: progress });
});
