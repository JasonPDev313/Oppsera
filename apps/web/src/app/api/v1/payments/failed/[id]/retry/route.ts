import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { retryFailedPayment } from '@oppsera/module-payments';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.indexOf('failed') + 1]!;
}

/**
 * POST /api/v1/payments/failed/:id/retry
 * Retry a failed payment with same or different payment method.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const paymentIntentId = extractId(request);
    const body = await request.json();

    const result = await retryFailedPayment(ctx, {
      paymentIntentId,
      token: body.token,
      paymentMethodId: body.paymentMethodId,
      paymentMethodType: body.paymentMethodType,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'payments.transactions.void', writeAccess: true },
);
