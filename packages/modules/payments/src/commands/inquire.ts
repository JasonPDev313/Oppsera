import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { paymentIntents, paymentTransactions } from '@oppsera/db';
import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { InquirePaymentInput } from '../gateway-validation';
import type { PaymentIntentResult } from '../types/gateway-results';
import { resolveProvider } from '../helpers/resolve-provider';

/**
 * Inquire about a payment intent's current status with the provider.
 * Records an inquiry transaction and updates the intent if needed.
 */
export async function inquirePaymentIntent(
  ctx: RequestContext,
  input: InquirePaymentInput,
): Promise<PaymentIntentResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  return withTenant(ctx.tenantId, async (tx) => {
    // 1. Load payment intent
    const [intent] = await tx
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.id, input.paymentIntentId),
          eq(paymentIntents.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!intent) {
      throw new AppError('PAYMENT_INTENT_NOT_FOUND', 'Payment intent not found', 404);
    }

    // 2. Get the latest provider ref
    const [latestTxn] = await tx
      .select()
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.paymentIntentId, intent.id),
          eq(paymentTransactions.tenantId, ctx.tenantId),
        ),
      )
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(1);

    if (!latestTxn?.providerRef) {
      // No provider ref — just return current state
      return mapIntentToResult(intent);
    }

    // 3. Resolve provider and inquire
    const { provider, merchantId } = await resolveProvider(
      ctx.tenantId,
      intent.locationId,
    );

    const inquireResponse = await provider.inquire(latestTxn.providerRef, merchantId);

    // 4. Record inquiry transaction
    await tx.insert(paymentTransactions).values({
      tenantId: ctx.tenantId,
      paymentIntentId: intent.id,
      transactionType: 'inquiry',
      providerRef: inquireResponse.providerRef,
      amountCents: intent.amountCents,
      responseStatus: inquireResponse.status,
      responseCode: inquireResponse.responseCode || null,
      responseText: inquireResponse.responseText || null,
      providerResponse: inquireResponse.rawResponse,
    });

    return mapIntentToResult(intent, latestTxn.providerRef);
  });
}

function mapIntentToResult(
  intent: Record<string, any>,
  providerRef?: string | null,
): PaymentIntentResult {
  return {
    id: intent.id,
    tenantId: intent.tenantId,
    locationId: intent.locationId,
    status: intent.status,
    amountCents: intent.amountCents,
    currency: intent.currency,
    authorizedAmountCents: intent.authorizedAmountCents ?? null,
    capturedAmountCents: intent.capturedAmountCents ?? null,
    refundedAmountCents: intent.refundedAmountCents ?? null,
    orderId: intent.orderId ?? null,
    customerId: intent.customerId ?? null,
    cardLast4: intent.cardLast4 ?? null,
    cardBrand: intent.cardBrand ?? null,
    providerRef: providerRef ?? null,
    errorMessage: intent.errorMessage ?? null,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}
