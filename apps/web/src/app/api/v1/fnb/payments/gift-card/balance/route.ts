import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';

// GET /api/v1/fnb/payments/gift-card/balance?cardNumber=xxx — check gift card balance
// TODO: Wire to getGiftCardBalance query when implemented
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const cardNumber = searchParams.get('cardNumber');

    if (!cardNumber) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'cardNumber query parameter required' } },
        { status: 400 },
      );
    }

    // Placeholder: return mock balance for development
    // The real implementation will query the gift card system
    void ctx;
    return NextResponse.json({
      data: {
        cardNumber,
        balanceCents: 0,
        status: 'not_found',
      },
    });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage' },
);
