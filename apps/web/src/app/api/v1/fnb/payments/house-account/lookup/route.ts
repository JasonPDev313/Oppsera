import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';

// GET /api/v1/fnb/payments/house-account/lookup?q=xxx — lookup customer house account
// TODO: Wire to customer billing lookup when house account integration is implemented
export const GET = withMiddleware(
  async (_request: NextRequest, _ctx) => {
    return NextResponse.json(
      { error: { code: 'NOT_IMPLEMENTED', message: 'House account lookup is not yet implemented' } },
      { status: 501 },
    );
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create' },
);
