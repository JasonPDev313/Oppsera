import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { refundPayment } from '@oppsera/module-payments';
import { generateUlid } from '@oppsera/shared';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.indexOf('transactions') + 1]!;
}

/**
 * POST /api/v1/payments/transactions/:id/refund
 * Refund a payment intent (full or partial).
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const paymentIntentId = extractId(request);
    const body = await request.json().catch(() => ({}));
    const amountCents = body.amountCents as number | undefined;

    const result = await refundPayment(ctx, {
      clientRequestId: `refund-${generateUlid()}`,
      paymentIntentId,
      ...(amountCents !== undefined ? { amountCents } : {}),
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'payments.transactions.refund', writeAccess: true },
);
