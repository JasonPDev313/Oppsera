import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { paymentIntents } from '@oppsera/db';
import { AppError, generateUlid } from '@oppsera/shared';
import { auditLog } from '@oppsera/core';
import type { RequestContext } from '@oppsera/core';
import { paymentsFacade } from '../facade';
import type { PaymentIntentResult } from '../types/gateway-results';

// ── Validation ────────────────────────────────────────────────

export const retryFailedPaymentSchema = z.object({
  paymentIntentId: z.string().min(1),
  token: z.string().optional(), // new card token if using different card
  paymentMethodId: z.string().optional(), // stored payment method ID
  paymentMethodType: z.enum(['card', 'ach', 'token', 'terminal']).default('card'),
});

export type RetryFailedPaymentInput = z.input<typeof retryFailedPaymentSchema>;

// ── Command ───────────────────────────────────────────────────

export async function retryFailedPayment(
  ctx: RequestContext,
  input: RetryFailedPaymentInput,
): Promise<PaymentIntentResult> {
  const parsed = retryFailedPaymentSchema.parse(input);

  // Load original failed intent (read-only, outside transaction)
  const { withTenant } = await import('@oppsera/db');
  const [original] = await withTenant(ctx.tenantId, async (tx) => {
    return tx
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.tenantId, ctx.tenantId),
          eq(paymentIntents.id, parsed.paymentIntentId),
        ),
      )
      .limit(1);
  });

  if (!original) {
    throw new AppError('NOT_FOUND', 'Original payment intent not found', 404);
  }

  if (original.status !== 'declined' && original.status !== 'error') {
    throw new AppError(
      'INVALID_STATE',
      `Cannot retry a payment in status '${original.status}'. Only declined or error payments can be retried.`,
      409,
    );
  }

  // Determine the token to use
  const token = parsed.token ?? original.token;
  if (!token && !parsed.paymentMethodId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Either a new card token or stored payment method ID is required for retry.',
      400,
    );
  }

  // Create a new sale attempt via the facade
  const result = await paymentsFacade.sale(ctx, {
    clientRequestId: generateUlid(),
    amountCents: original.amountCents,
    currency: original.currency,
    token: parsed.paymentMethodId ? undefined : (token ?? undefined),
    paymentMethodId: parsed.paymentMethodId,
    orderId: original.orderId ?? undefined,
    customerId: original.customerId ?? undefined,
    paymentMethodType: parsed.paymentMethodType,
    metadata: {
      retryOf: original.id,
      originalIntentId: original.id,
      retryAttempt: true,
    },
  });

  await auditLog(ctx, 'payment.intent.retried', 'payment_intent', result.id);

  return result;
}
