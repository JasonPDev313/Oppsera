import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { voidPayment } from '@oppsera/module-payments';
import { generateUlid } from '@oppsera/shared';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // .../transactions/:id/void → id is at index -2
  return parts[parts.indexOf('transactions') + 1]!;
}

/**
 * POST /api/v1/payments/transactions/:id/void
 * Void a payment intent.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const paymentIntentId = extractId(request);
    const result = await voidPayment(ctx, {
      clientRequestId: `void-${generateUlid()}`,
      paymentIntentId,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'payments.transactions.void', writeAccess: true },
);
