import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { inquirePaymentIntent } from '@oppsera/module-payments';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.indexOf('transactions') + 1]!;
}

/**
 * POST /api/v1/payments/transactions/:id/inquire
 * Refresh status from the payment provider.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const paymentIntentId = extractId(request);
    const result = await inquirePaymentIntent(ctx, { paymentIntentId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'payments.transactions.view', writeAccess: true },
);
