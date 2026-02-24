import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { paymentIntents, paymentTransactions } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AuthorizePaymentInput } from '../gateway-validation';
import type { PaymentIntentResult } from '../types/gateway-results';
import { PAYMENT_GATEWAY_EVENTS, assertIntentTransition } from '../events/gateway-types';
import { resolveProvider } from '../helpers/resolve-provider';
import { centsToDollars, dollarsToCents, generateProviderOrderId, extractCardLast4, detectCardBrand } from '../helpers/amount';
import { CardPointeTimeoutError } from '../providers/cardpointe/client';
import { interpretResponse } from '../services/response-interpreter';
import type { ResponseInterpretation } from '../services/response-interpreter';

export async function authorizePayment(
  ctx: RequestContext,
  input: AuthorizePaymentInput,
): Promise<PaymentIntentResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  // Resolve provider + MID outside the transaction (read-only)
  const { provider, providerId, merchantAccountId, merchantId } = await resolveProvider(
    ctx.tenantId,
    ctx.locationId,
    input.terminalId,
  );

  const providerOrderId = generateProviderOrderId();
  const isCapture = false;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Idempotency check via unique idempotency_key on payment_intents
    const [existing] = await tx
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.tenantId, ctx.tenantId),
          eq(paymentIntents.idempotencyKey, input.clientRequestId),
        ),
      )
      .limit(1);

    if (existing) {
      return { result: mapIntentToResult(existing, null, null), events: [] };
    }

    // 2. Create payment intent
    const [intent] = await tx
      .insert(paymentIntents)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
        providerId,
        merchantAccountId,
        status: 'created',
        amountCents: input.amountCents,
        currency: input.currency ?? 'USD',
        customerId: input.customerId ?? null,
        orderId: input.orderId ?? null,
        providerOrderId,
        paymentMethodType: input.paymentMethodType ?? 'card',
        token: input.token ?? null,
        metadata: input.metadata ?? null,
        surchargeAmountCents: input.surchargeAmountCents ?? 0,
        idempotencyKey: input.clientRequestId,
        createdBy: ctx.user.id,
      })
      .returning();

    // 3. Call provider
    let providerRef: string | null = null;
    let txnStatus: 'approved' | 'declined' | 'retry' | 'error' = 'error';
    let authCode: string | null = null;
    let responseCode = '';
    let responseText = '';
    let cardLast4 = extractCardLast4(input.token ?? '');
    let cardBrand = detectCardBrand(input.token ?? '');
    let avsResponse: string | null = null;
    let cvvResponse: string | null = null;
    let rawResponse: Record<string, unknown> = {};
    let authorizedAmountCents: number | null = null;

    try {
      const authResponse = await provider.authorize({
        merchantId,
        amount: centsToDollars(input.amountCents),
        currency: input.currency ?? 'USD',
        token: input.token ?? '',
        expiry: input.expiry,
        cvv: input.cvv,
        orderId: providerOrderId,
        capture: 'N',
        ecomind: input.ecomind ?? 'E',
        name: input.name,
        address: input.address,
        postal: input.postal,
        receipt: 'Y',
      });

      providerRef = authResponse.providerRef;
      txnStatus = authResponse.status;
      authCode = authResponse.authCode;
      responseCode = authResponse.responseCode;
      responseText = authResponse.responseText;
      avsResponse = authResponse.avsResponse;
      cvvResponse = authResponse.cvvResponse;
      rawResponse = authResponse.rawResponse;

      if (authResponse.cardLast4) cardLast4 = authResponse.cardLast4;
      if (authResponse.cardBrand) cardBrand = authResponse.cardBrand;
      if (authResponse.status === 'approved') {
        authorizedAmountCents = dollarsToCents(authResponse.amount);
      }
    } catch (err) {
      // Timeout recovery
      if (err instanceof CardPointeTimeoutError) {
        const recovery = await handleAuthTimeout(provider, merchantId, providerOrderId);
        if (recovery.outcome === 'recovered') {
          providerRef = recovery.providerRef;
          txnStatus = recovery.status;
          authCode = recovery.authCode;
          responseCode = recovery.responseCode;
          responseText = recovery.responseText;
          rawResponse = recovery.rawResponse;
          if (recovery.status === 'approved') {
            authorizedAmountCents = dollarsToCents(recovery.amount);
          }
        } else if (recovery.outcome === 'voided') {
          txnStatus = 'error';
          responseText = 'Authorization timed out — safely voided at gateway';
        } else {
          // unknown — gateway may have charged but we cannot confirm
          txnStatus = 'error'; // will be overridden to unknown_at_gateway below
          responseText = 'Authorization timed out and could not be recovered — status unknown at gateway';
        }
      } else {
        txnStatus = 'error';
        responseText = err instanceof Error ? err.message : 'Unknown provider error';
      }
    }

    // 4. Interpret response
    const interpretation = interpretResponse({
      responseCode: responseCode || null,
      responseText: responseText || null,
      respstat: (rawResponse as Record<string, unknown>)?.respstat as string ?? null,
      avsResponse,
      cvvResponse,
      rawResponse: rawResponse as Record<string, unknown>,
    });

    // 5. Insert payment transaction record
    await tx.insert(paymentTransactions).values({
      tenantId: ctx.tenantId,
      paymentIntentId: intent!.id,
      transactionType: 'authorization',
      providerRef,
      authCode,
      amountCents: input.amountCents,
      responseStatus: txnStatus,
      responseCode: responseCode || null,
      responseText: responseText || null,
      avsResponse,
      cvvResponse,
      providerResponse: rawResponse,
      clientRequestId: input.clientRequestId,
      surchargeAmountCents: input.surchargeAmountCents ?? 0,
      declineCategory: interpretation.declineCategory,
      userMessage: interpretation.userMessage,
      suggestedAction: interpretation.suggestedAction,
      retryable: interpretation.retryable,
      avsResult: interpretation.avsResult?.pass === true ? 'pass' : interpretation.avsResult?.pass === false ? 'fail' : null,
      cvvResult: interpretation.cvvResult?.pass === true ? 'pass' : interpretation.cvvResult?.pass === false ? 'fail' : null,
      visaDeclineCategory: interpretation.visaDeclineCategory,
      mcAdviceCode: interpretation.mcAdviceCode,
      processor: interpretation.processor,
    });

    // 6. Update payment intent status
    let intentStatus: string;
    let errorMessage: string | null = null;

    if (txnStatus === 'approved') {
      intentStatus = 'authorized';
    } else if (txnStatus === 'declined') {
      intentStatus = 'declined';
      errorMessage = responseText;
    } else if (responseText?.includes('status unknown at gateway')) {
      intentStatus = 'unknown_at_gateway';
      errorMessage = responseText;
    } else {
      intentStatus = 'error';
      errorMessage = responseText;
    }

    assertIntentTransition('created', intentStatus as any);

    const [updated] = await tx
      .update(paymentIntents)
      .set({
        status: intentStatus,
        authorizedAmountCents,
        cardLast4,
        cardBrand,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, intent!.id))
      .returning();

    // 7. Build event
    const eventType =
      txnStatus === 'approved'
        ? PAYMENT_GATEWAY_EVENTS.AUTHORIZED
        : PAYMENT_GATEWAY_EVENTS.DECLINED;

    const event = buildEventFromContext(ctx, eventType, {
      paymentIntentId: intent!.id,
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      merchantAccountId,
      amountCents: input.amountCents,
      authorizedAmountCents: authorizedAmountCents ?? 0,
      currency: input.currency ?? 'USD',
      cardLast4,
      cardBrand,
      orderId: input.orderId ?? null,
      customerId: input.customerId ?? null,
      providerRef,
      paymentMethodType: input.paymentMethodType ?? 'card',
      surchargeAmountCents: input.surchargeAmountCents ?? 0,
      responseCode,
      responseText,
    });

    return { result: mapIntentToResult(updated!, providerRef, interpretation), events: [event] };
  });

  await auditLog(ctx, 'payment.authorized', 'payment_intent', result.id);
  return result;
}

type TimeoutRecoveryResult =
  | {
      outcome: 'recovered';
      providerRef: string;
      status: 'approved' | 'declined' | 'retry';
      authCode: string | null;
      amount: string;
      responseCode: string;
      responseText: string;
      rawResponse: Record<string, unknown>;
    }
  | { outcome: 'voided' }
  | { outcome: 'unknown' };

/**
 * Timeout recovery: inquireByOrderId → if not found, voidByOrderId 3x → unknown
 */
async function handleAuthTimeout(
  provider: { inquireByOrderId: (orderId: string, merchantId: string) => Promise<any>; voidByOrderId: (request: { merchantId: string; orderId: string }) => Promise<any> },
  merchantId: string,
  providerOrderId: string,
): Promise<TimeoutRecoveryResult> {
  try {
    // First, inquire to see if the authorization actually went through
    const inquireResult = await provider.inquireByOrderId(providerOrderId, merchantId);
    if (inquireResult) {
      return {
        outcome: 'recovered',
        providerRef: inquireResult.providerRef,
        status: inquireResult.status,
        authCode: inquireResult.authCode,
        amount: inquireResult.amount,
        responseCode: inquireResult.responseCode,
        responseText: inquireResult.responseText,
        rawResponse: inquireResult.rawResponse,
      };
    }
  } catch {
    // Inquire failed — proceed to void attempts
  }

  // If not found or inquire failed, try to void 3x
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await provider.voidByOrderId({ merchantId, orderId: providerOrderId });
      return { outcome: 'voided' }; // Voided successfully — safe, no charge
    } catch {
      // Retry
    }
  }

  return { outcome: 'unknown' }; // All void attempts failed — gateway state unknown
}

function mapIntentToResult(
  intent: Record<string, any>,
  providerRef: string | null,
  interpretation: ResponseInterpretation | null,
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
    userMessage: interpretation?.userMessage ?? null,
    suggestedAction: interpretation?.suggestedAction ?? null,
    declineCategory: interpretation?.declineCategory ?? null,
    retryable: interpretation?.retryable ?? false,
    avsResult: interpretation?.avsResult?.pass === true ? 'pass' : interpretation?.avsResult?.pass === false ? 'fail' : null,
    cvvResult: interpretation?.cvvResult?.pass === true ? 'pass' : interpretation?.cvvResult?.pass === false ? 'fail' : null,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}
