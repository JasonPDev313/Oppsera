import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { BUSINESS_VERTICALS } from '@oppsera/shared';

export const GET = withMiddleware(
  async (_request: NextRequest) => {
    return NextResponse.json({ data: BUSINESS_VERTICALS });
  },
  { authenticated: true, requireTenant: false },
);
