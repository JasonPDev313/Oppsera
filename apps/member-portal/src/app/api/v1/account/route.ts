import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';
import { getMemberPortalAccount } from '@oppsera/module-membership';

export const GET = withPortalAuth(async (_request: NextRequest, { session }) => {
  const account = await getMemberPortalAccount({
    tenantId: session.tenantId,
    customerId: session.customerId,
  });

  if (!account) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No active membership found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: account });
});
