import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { paymentIntents, paymentTransactions } from '@oppsera/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { VoidPaymentInput } from '../gateway-validation';
import type { PaymentIntentResult } from '../types/gateway-results';
import { PAYMENT_GATEWAY_EVENTS, assertIntentTransition } from '../events/gateway-types';
import { resolveProvider } from '../helpers/resolve-provider';
import { interpretResponse } from '../services/response-interpreter';
import type { ResponseInterpretation } from '../services/response-interpreter';

export async function voidPayment(
  ctx: RequestContext,
  input: VoidPaymentInput,
): Promise<PaymentIntentResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load payment intent with FOR UPDATE lock (prevents concurrent void race)
    await tx.execute(
      sql`SELECT id FROM payment_intents WHERE id = ${input.paymentIntentId} AND tenant_id = ${ctx.tenantId} FOR UPDATE`,
    );
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

    // 2. Idempotency — if already voided, return existing result (double-click safe)
    if (intent.status === 'voided') {
      return { result: mapIntentToResult(intent, null), events: [] };
    }

    // 3. Validate status — can void from authorized or captured (pre-settlement only)
    assertIntentTransition(intent.status as any, 'voided');

    // 4. Get latest provider ref
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

    // 6. Call provider void
    const voidResponse = await provider.void({
      merchantId,
      providerRef: latestTxn.providerRef,
    });

    // 7. Interpret response
    const interpretation = interpretResponse({
      responseCode: voidResponse.responseCode || null,
      responseText: voidResponse.responseText || null,
      respstat: (voidResponse.rawResponse as Record<string, unknown>)?.respstat as string ?? null,
      avsResponse: null,
      cvvResponse: null,
      rawResponse: voidResponse.rawResponse as Record<string, unknown>,
    });

    // 8. Insert payment transaction
    await tx.insert(paymentTransactions).values({
      tenantId: ctx.tenantId,
      paymentIntentId: intent.id,
      transactionType: 'void',
      providerRef: voidResponse.providerRef,
      amountCents: intent.amountCents,
      responseStatus: voidResponse.status,
      responseCode: voidResponse.responseCode || null,
      responseText: voidResponse.responseText || null,
      providerResponse: voidResponse.rawResponse,
      clientRequestId: input.clientRequestId,
      declineCategory: interpretation.declineCategory,
      userMessage: interpretation.userMessage,
      suggestedAction: interpretation.suggestedAction,
      retryable: interpretation.retryable,
      processor: interpretation.processor,
    });

    // 9. Update intent
    let newStatus: string;
    let errorMessage: string | null = null;

    if (voidResponse.status === 'approved') {
      newStatus = 'voided';
    } else {
      newStatus = 'error';
      errorMessage = voidResponse.responseText;
    }

    const [updated] = await tx
      .update(paymentIntents)
      .set({
        status: newStatus,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, intent.id))
      .returning();

    // 10. Build event
    if (voidResponse.status === 'approved') {
      const event = buildEventFromContext(ctx, PAYMENT_GATEWAY_EVENTS.VOIDED, {
        paymentIntentId: intent.id,
        tenantId: ctx.tenantId,
        locationId: intent.locationId,
        amountCents: intent.amountCents,
        orderId: intent.orderId,
        customerId: intent.customerId,
        providerRef: voidResponse.providerRef,
      });
      return { result: mapIntentToResult(updated!, interpretation), events: [event] };
    }

    return { result: mapIntentToResult(updated!, interpretation), events: [] };
  });

  await auditLog(ctx, 'payment.voided', 'payment_intent', result.id);
  return result;
}

function mapIntentToResult(intent: Record<string, any>, interpretation?: ResponseInterpretation | null): PaymentIntentResult {
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
    userMessage: interpretation?.userMessage ?? null,
    suggestedAction: interpretation?.suggestedAction ?? null,
    declineCategory: interpretation?.declineCategory ?? null,
    retryable: interpretation?.retryable ?? false,
    avsResult: null,
    cvvResult: null,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}
