import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { resolveFailedPayment } from '@oppsera/module-payments';
import { AppError } from '@oppsera/shared';

// Bug 12 fix: validate the request body with Zod before passing to the command.
// Bug 4 fix (resolve route): also corrects the permission from 'payments.transactions.void'
// to 'payments.transactions.resolve' — resolving a failed payment is not the same as voiding.
const resolveBodySchema = z.object({
  resolution: z.enum(['resolved', 'dismissed']),
  reason: z.string().min(1).max(500),
  paidByOtherMeans: z.boolean().default(false),
  otherMeansType: z.string().max(50).optional(),
});

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
    const rawBody = await request.json();
    const parsed = resolveBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid request body', 400);
    }

    const result = await resolveFailedPayment(ctx, {
      paymentIntentId,
      resolution: parsed.data.resolution,
      reason: parsed.data.reason,
      paidByOtherMeans: parsed.data.paidByOtherMeans,
      otherMeansType: parsed.data.otherMeansType,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'payments.transactions.resolve', writeAccess: true },
);
