import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { assertImpersonationCanRefund } from '@oppsera/core/auth/impersonation-safety';
import { refundPayment } from '@oppsera/module-payments';
import { generateUlid } from '@oppsera/shared';
import { withTenant, paymentIntents } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

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

    // Impersonation safety: block refunds over $500
    if (ctx.impersonation) {
      if (amountCents !== undefined) {
        assertImpersonationCanRefund(ctx, amountCents);
      } else {
        // Full refund — look up the intent amount
        const intent = await withTenant(ctx.tenantId, async (tx) => {
          const [row] = await tx
            .select({ amountCents: paymentIntents.amountCents })
            .from(paymentIntents)
            .where(and(eq(paymentIntents.tenantId, ctx.tenantId), eq(paymentIntents.id, paymentIntentId)))
            .limit(1);
          return row;
        });
        if (intent) {
          assertImpersonationCanRefund(ctx, intent.amountCents);
        }
      }
    }

    const result = await refundPayment(ctx, {
      clientRequestId: `refund-${generateUlid()}`,
      paymentIntentId,
      ...(amountCents !== undefined ? { amountCents } : {}),
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'payments.transactions.refund', writeAccess: true },
);
