import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { paymentIntents, paymentTransactions } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { SalePaymentInput } from '../gateway-validation';
import type { PaymentIntentResult } from '../types/gateway-results';
import { PAYMENT_GATEWAY_EVENTS, assertIntentTransition } from '../events/gateway-types';
import { resolveProvider } from '../helpers/resolve-provider';
import { centsToDollars, dollarsToCents, generateProviderOrderId, extractCardLast4, detectCardBrand } from '../helpers/amount';
import { CardPointeTimeoutError } from '../providers/cardpointe/client';
import { interpretResponse } from '../services/response-interpreter';
import type { ResponseInterpretation } from '../services/response-interpreter';

export async function salePayment(
  ctx: RequestContext,
  input: SalePaymentInput,
): Promise<PaymentIntentResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const { provider, providerId, merchantAccountId, merchantId } = await resolveProvider(
    ctx.tenantId,
    ctx.locationId,
    input.terminalId,
  );

  const providerOrderId = generateProviderOrderId();

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Idempotency
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
    const totalCents = input.amountCents + (input.tipCents ?? 0);
    const isAch = (input.paymentMethodType ?? 'card') === 'ach';

    const [intent] = await tx
      .insert(paymentIntents)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
        providerId,
        merchantAccountId,
        status: 'created',
        amountCents: totalCents,
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
        // ACH-specific fields
        ...(isAch ? {
          achAccountType: input.achAccountType ?? null,
          achSecCode: input.achSecCode ?? null,
          achSettlementStatus: 'pending',
          bankLast4: input.token ? input.token.slice(-4) : null,
        } : {}),
      })
      .returning();

    // 3. Call provider with capture='Y' (sale = auth + capture)
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
    let capturedAmountCents: number | null = null;

    try {
      const saleResponse = await provider.sale({
        merchantId,
        amount: centsToDollars(totalCents),
        currency: input.currency ?? 'USD',
        token: input.token ?? '',
        expiry: isAch ? undefined : input.expiry, // no expiry for ACH
        cvv: isAch ? undefined : input.cvv,        // no CVV for ACH
        orderId: providerOrderId,
        capture: 'Y',
        ecomind: input.ecomind ?? 'E',
        name: input.name,
        address: input.address,
        postal: input.postal,
        receipt: 'Y',
        // ACH-specific fields
        ...(isAch ? {
          achAccountType: input.achAccountType,
          achSecCode: input.achSecCode,
        } : {}),
      });

      providerRef = saleResponse.providerRef;
      txnStatus = saleResponse.status;
      authCode = saleResponse.authCode;
      responseCode = saleResponse.responseCode;
      responseText = saleResponse.responseText;
      avsResponse = saleResponse.avsResponse;
      cvvResponse = saleResponse.cvvResponse;
      rawResponse = saleResponse.rawResponse;

      if (saleResponse.cardLast4) cardLast4 = saleResponse.cardLast4;
      if (saleResponse.cardBrand) cardBrand = saleResponse.cardBrand;
      if (saleResponse.status === 'approved') {
        capturedAmountCents = dollarsToCents(saleResponse.amount);
      }
    } catch (err) {
      if (err instanceof CardPointeTimeoutError) {
        // Timeout recovery: inquire → void 3x → unknown_at_gateway
        let recovered = false;
        let voidSucceeded = false;

        try {
          const inquireResult = await provider.inquireByOrderId(providerOrderId, merchantId);
          if (inquireResult) {
            providerRef = inquireResult.providerRef;
            txnStatus = inquireResult.status;
            authCode = inquireResult.authCode;
            responseCode = inquireResult.responseCode;
            responseText = inquireResult.responseText;
            rawResponse = inquireResult.rawResponse;
            if (inquireResult.status === 'approved') {
              capturedAmountCents = dollarsToCents(inquireResult.amount);
            }
            recovered = true;
          }
        } catch {
          // Inquire failed
        }

        if (!recovered) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await provider.voidByOrderId({ merchantId, orderId: providerOrderId });
              voidSucceeded = true;
              break;
            } catch { /* retry */ }
          }

          if (voidSucceeded) {
            responseText = 'Sale timed out — safely voided at gateway';
          } else {
            responseText = 'Sale timed out and could not be recovered — status unknown at gateway';
          }
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

    // 5. Insert payment transaction
    await tx.insert(paymentTransactions).values({
      tenantId: ctx.tenantId,
      paymentIntentId: intent!.id,
      transactionType: 'sale',
      providerRef,
      authCode,
      amountCents: totalCents,
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

    // 6. Update intent
    let intentStatus: string;
    let errorMessage: string | null = null;

    if (txnStatus === 'approved') {
      // ACH "approved" = accepted for origination, NOT funds received
      intentStatus = isAch ? 'ach_pending' : 'captured';
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

    const updateFields: Record<string, unknown> = {
      status: intentStatus,
      authorizedAmountCents: capturedAmountCents,
      capturedAmountCents: isAch ? null : capturedAmountCents, // ACH not captured until settled
      cardLast4: isAch ? null : cardLast4,
      cardBrand: isAch ? null : cardBrand,
      errorMessage,
      updatedAt: new Date(),
    };

    // For ACH, update settlement status to originated when accepted
    if (isAch && txnStatus === 'approved') {
      updateFields.achSettlementStatus = 'originated';
    }

    const [updated] = await tx
      .update(paymentIntents)
      .set(updateFields)
      .where(eq(paymentIntents.id, intent!.id))
      .returning();

    // 7. Build event — ACH uses ACH_ORIGINATED instead of CAPTURED
    let eventType: string;
    if (txnStatus === 'approved') {
      eventType = isAch
        ? PAYMENT_GATEWAY_EVENTS.ACH_ORIGINATED
        : PAYMENT_GATEWAY_EVENTS.CAPTURED;
    } else {
      eventType = PAYMENT_GATEWAY_EVENTS.DECLINED;
    }

    const eventPayload: Record<string, unknown> = {
      paymentIntentId: intent!.id,
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      merchantAccountId,
      amountCents: totalCents,
      currency: input.currency ?? 'USD',
      orderId: input.orderId ?? null,
      customerId: input.customerId ?? null,
      providerRef,
      paymentMethodType: input.paymentMethodType ?? 'card',
      surchargeAmountCents: input.surchargeAmountCents ?? 0,
      responseCode,
      responseText,
    };

    if (isAch) {
      // ACH-specific event payload
      eventPayload.achSecCode = input.achSecCode ?? null;
      eventPayload.achAccountType = input.achAccountType ?? null;
      eventPayload.bankLast4 = input.token ? input.token.slice(-4) : null;
    } else {
      // Card-specific event payload
      eventPayload.capturedAmountCents = capturedAmountCents ?? 0;
      eventPayload.authorizedAmountCents = capturedAmountCents ?? 0;
      eventPayload.cardLast4 = cardLast4;
      eventPayload.cardBrand = cardBrand;
    }

    const event = buildEventFromContext(ctx, eventType, eventPayload);

    return { result: mapIntentToResult(updated!, providerRef, interpretation), events: [event] };
  });

  await auditLog(ctx, 'payment.sale', 'payment_intent', result.id);
  return result;
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
