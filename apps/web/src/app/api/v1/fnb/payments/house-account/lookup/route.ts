import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';

// GET /api/v1/fnb/payments/house-account/lookup?q=xxx — lookup customer house account
// TODO: Wire to customer billing lookup when house account integration is implemented
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'q query parameter required' } },
        { status: 400 },
      );
    }

    // Placeholder: return not found
    // The real implementation will search customers and their billing accounts
    void ctx;
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Customer not found or no house account on file' } },
      { status: 404 },
    );
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage' },
);
