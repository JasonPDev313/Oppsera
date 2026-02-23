import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';

export const GET = withPortalAuth(async (_request: NextRequest, { session }) => {
  return NextResponse.json({
    data: {
      customerId: session.customerId,
      tenantId: session.tenantId,
      email: session.email,
    },
  });
});
