import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { paymentIntents, paymentTransactions } from '@oppsera/db';
import { eq, and, desc } from 'drizzle-orm';
import type { CapturePaymentInput } from '../gateway-validation';
import type { PaymentIntentResult } from '../types/gateway-results';
import { PAYMENT_GATEWAY_EVENTS, assertIntentTransition } from '../events/gateway-types';
import { resolveProvider } from '../helpers/resolve-provider';
import { centsToDollars, dollarsToCents } from '../helpers/amount';

export async function capturePayment(
  ctx: RequestContext,
  input: CapturePaymentInput,
): Promise<PaymentIntentResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Idempotency — check if we already processed this clientRequestId
    const [existingIntent] = await tx
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.tenantId, ctx.tenantId),
          eq(paymentIntents.idempotencyKey, input.clientRequestId),
        ),
      )
      .limit(1);

    // If the idempotency key matches the capture target AND it's already captured, return it
    if (existingIntent && existingIntent.id === input.paymentIntentId && existingIntent.status === 'captured') {
      return { result: mapIntentToResult(existingIntent), events: [] };
    }

    // 2. Load payment intent
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

    // 3. Validate status transition
    assertIntentTransition(intent.status as any, 'captured');

    // 4. Get the latest provider ref (retref)
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
      throw new AppError('NO_PROVIDER_REF', 'No provider reference found for this payment', 422);
    }

    // 5. Resolve provider
    const { provider, merchantId } = await resolveProvider(
      ctx.tenantId,
      intent.locationId,
    );

    // 6. Call provider capture
    const captureAmountCents = input.amountCents ?? intent.authorizedAmountCents ?? intent.amountCents;
    const captureResponse = await provider.capture({
      merchantId,
      providerRef: latestTxn.providerRef,
      amount: centsToDollars(captureAmountCents),
    });

    // 7. Insert payment transaction
    await tx.insert(paymentTransactions).values({
      tenantId: ctx.tenantId,
      paymentIntentId: intent.id,
      transactionType: 'capture',
      providerRef: captureResponse.providerRef,
      amountCents: captureAmountCents,
      responseStatus: captureResponse.status,
      responseCode: captureResponse.responseCode || null,
      responseText: captureResponse.responseText || null,
      providerResponse: captureResponse.rawResponse,
    });

    // 8. Update intent
    let newStatus: string;
    let errorMessage: string | null = null;

    if (captureResponse.status === 'approved') {
      newStatus = 'captured';
    } else {
      newStatus = 'error';
      errorMessage = captureResponse.responseText;
    }

    const [updated] = await tx
      .update(paymentIntents)
      .set({
        status: newStatus,
        capturedAmountCents: captureResponse.status === 'approved' ? dollarsToCents(captureResponse.amount) : intent.capturedAmountCents,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, intent.id))
      .returning();

    // 9. Build event
    if (captureResponse.status === 'approved') {
      const event = buildEventFromContext(ctx, PAYMENT_GATEWAY_EVENTS.CAPTURED, {
        paymentIntentId: intent.id,
        tenantId: ctx.tenantId,
        locationId: intent.locationId,
        merchantAccountId: intent.merchantAccountId,
        amountCents: intent.amountCents,
        capturedAmountCents: dollarsToCents(captureResponse.amount),
        currency: intent.currency,
        orderId: intent.orderId,
        customerId: intent.customerId,
        providerRef: captureResponse.providerRef,
        tenderId: intent.tenderId,
      });
      return { result: mapIntentToResult(updated!), events: [event] };
    }

    return { result: mapIntentToResult(updated!), events: [] };
  });

  await auditLog(ctx, 'payment.captured', 'payment_intent', result.id);
  return result;
}

function mapIntentToResult(intent: Record<string, any>): PaymentIntentResult {
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
    providerRef: null,
    errorMessage: intent.errorMessage ?? null,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}
