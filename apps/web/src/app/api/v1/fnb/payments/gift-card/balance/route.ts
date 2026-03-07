import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';

// GET /api/v1/fnb/payments/gift-card/balance?cardNumber=xxx — check gift card balance
// TODO: Wire to getGiftCardBalance query when implemented
export const GET = withMiddleware(
  async (_request: NextRequest, _ctx) => {
    return NextResponse.json(
      { error: { code: 'NOT_IMPLEMENTED', message: 'Gift card balance check is not yet implemented' } },
      { status: 501 },
    );
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.create' },
);
