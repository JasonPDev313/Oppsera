import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { resolveFailedPayment } from '@oppsera/module-payments';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.indexOf('failed') + 1]!;
}

/**
 * POST /api/v1/payments/failed/:id/resolve
 * Mark a failed payment as resolved (paid by other means) or dismissed.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const paymentIntentId = extractId(request);
    const body = await request.json();

    const result = await resolveFailedPayment(ctx, {
      paymentIntentId,
      resolution: body.resolution,
      reason: body.reason,
      paidByOtherMeans: body.paidByOtherMeans,
      otherMeansType: body.otherMeansType,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'payments.transactions.void', writeAccess: true },
);
