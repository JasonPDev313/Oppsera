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
      return { result: mapIntentToResult(existing, null), events: [] };
    }

    // 2. Create payment intent
    const totalCents = input.amountCents + (input.tipCents ?? 0);

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
        idempotencyKey: input.clientRequestId,
        createdBy: ctx.user.id,
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
        expiry: input.expiry,
        cvv: input.cvv,
        orderId: providerOrderId,
        capture: 'Y',
        ecomind: input.ecomind ?? 'E',
        name: input.name,
        address: input.address,
        postal: input.postal,
        receipt: 'Y',
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
        // Timeout recovery: inquire → void 3x → error
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
          }
        } catch {
          // Inquire failed
        }

        if (txnStatus === 'error') {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await provider.voidByOrderId({ merchantId, orderId: providerOrderId });
              break;
            } catch { /* retry */ }
          }
          responseText = 'Sale timed out and could not be recovered';
        }
      } else {
        txnStatus = 'error';
        responseText = err instanceof Error ? err.message : 'Unknown provider error';
      }
    }

    // 4. Insert payment transaction
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
    });

    // 5. Update intent
    let intentStatus: string;
    let errorMessage: string | null = null;

    if (txnStatus === 'approved') {
      intentStatus = 'captured'; // sale goes directly to captured
    } else if (txnStatus === 'declined') {
      intentStatus = 'declined';
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
        authorizedAmountCents: capturedAmountCents, // sale auth = capture amount
        capturedAmountCents,
        cardLast4,
        cardBrand,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, intent!.id))
      .returning();

    // 6. Build event
    const eventType =
      txnStatus === 'approved'
        ? PAYMENT_GATEWAY_EVENTS.CAPTURED
        : PAYMENT_GATEWAY_EVENTS.DECLINED;

    const event = buildEventFromContext(ctx, eventType, {
      paymentIntentId: intent!.id,
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      merchantAccountId,
      amountCents: totalCents,
      capturedAmountCents: capturedAmountCents ?? 0,
      authorizedAmountCents: capturedAmountCents ?? 0,
      currency: input.currency ?? 'USD',
      cardLast4,
      cardBrand,
      orderId: input.orderId ?? null,
      customerId: input.customerId ?? null,
      providerRef,
      paymentMethodType: input.paymentMethodType ?? 'card',
      responseCode,
      responseText,
    });

    return { result: mapIntentToResult(updated!, providerRef), events: [event] };
  });

  await auditLog(ctx, 'payment.sale', 'payment_intent', result.id);
  return result;
}

function mapIntentToResult(
  intent: Record<string, any>,
  providerRef: string | null,
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
