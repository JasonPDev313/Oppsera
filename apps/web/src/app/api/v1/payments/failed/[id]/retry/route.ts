import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { retryFailedPayment } from '@oppsera/module-payments';
import { AppError } from '@oppsera/shared';

// Bug 12 fix: validate the request body with Zod before passing to the command
const retryBodySchema = z.object({
  token: z.string().optional(),
  paymentMethodId: z.string().optional(),
  paymentMethodType: z.enum(['card', 'ach', 'token', 'terminal']).default('card'),
});

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
    const rawBody = await request.json();
    const parsed = retryBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid request body', 400);
    }

    const result = await retryFailedPayment(ctx, {
      paymentIntentId,
      token: parsed.data.token,
      paymentMethodId: parsed.data.paymentMethodId,
      paymentMethodType: parsed.data.paymentMethodType,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'payments.transactions.resolve', writeAccess: true },
);
