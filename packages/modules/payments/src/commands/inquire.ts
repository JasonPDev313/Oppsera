import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { paymentIntents, paymentTransactions } from '@oppsera/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { InquirePaymentInput } from '../gateway-validation';
import type { PaymentIntentResult } from '../types/gateway-results';
import {
  PAYMENT_GATEWAY_EVENTS,
  INTENT_STATUS_TRANSITIONS,
  type PaymentIntentStatus,
} from '../events/gateway-types';
import { resolveProvider } from '../helpers/resolve-provider';
import { dollarsToCents } from '../helpers/amount';
import { interpretResponse } from '../services/response-interpreter';
import type { ResponseInterpretation } from '../services/response-interpreter';

/**
 * Inquire about a payment intent's current status with the provider.
 * Records an inquiry transaction and auto-updates the intent if the provider
 * disagrees with the local status (e.g., timeout recovery).
 */
export async function inquirePaymentIntent(
  ctx: RequestContext,
  input: InquirePaymentInput,
): Promise<PaymentIntentResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Lock and load payment intent (FOR UPDATE since we may mutate status)
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
      return { result: mapIntentToResult(intent, null, null), events: [] };
    }

    // 3. Resolve provider and inquire
    const { provider, merchantId } = await resolveProvider(
      ctx.tenantId,
      intent.locationId,
    );

    const inquireResponse = await provider.inquire(latestTxn.providerRef, merchantId);

    // 4. Interpret response
    const interpretation = interpretResponse({
      responseCode: inquireResponse.responseCode || null,
      responseText: inquireResponse.responseText || null,
      respstat: (inquireResponse.rawResponse as Record<string, unknown>)?.respstat as string ?? null,
      avsResponse: null,
      cvvResponse: null,
      rawResponse: inquireResponse.rawResponse as Record<string, unknown>,
    });

    // 5. Record inquiry transaction
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
      clientRequestId: input.clientRequestId ?? null,
      declineCategory: interpretation.declineCategory,
      userMessage: interpretation.userMessage,
      suggestedAction: interpretation.suggestedAction,
      retryable: interpretation.retryable,
      processor: interpretation.processor,
    });

    // 6. Auto-update intent status if provider disagrees with local state
    //    This resolves error/unknown_at_gateway intents from timeout recovery
    const currentStatus = intent.status as PaymentIntentStatus;
    const providerStatus = inquireResponse.status; // 'approved' | 'declined' | 'retry' | 'error'

    const resolvableStatuses: PaymentIntentStatus[] = ['error', 'unknown_at_gateway'];
    if (resolvableStatuses.includes(currentStatus) && providerStatus !== 'retry') {
      // Map provider response to intent status
      let resolvedStatus: PaymentIntentStatus | null = null;
      if (providerStatus === 'approved') {
        // Determine if it was an auth-only or a sale (auth+capture)
        // If there's already a capture amount in the inquiry, it was captured
        const inquiredAmount = inquireResponse.amount ? dollarsToCents(inquireResponse.amount) : null;
        // Default to 'authorized' — the original transaction type determines behavior
        resolvedStatus = inquiredAmount ? 'captured' : 'authorized';
      } else if (providerStatus === 'declined') {
        resolvedStatus = 'declined';
      }

      if (resolvedStatus) {
        // Validate the transition is legal
        const allowed = INTENT_STATUS_TRANSITIONS[currentStatus];
        if (allowed && allowed.includes(resolvedStatus)) {
          const updateData: Record<string, any> = {
            status: resolvedStatus,
            errorMessage: null,
            updatedAt: new Date(),
          };

          if (resolvedStatus === 'authorized' && inquireResponse.amount) {
            updateData.authorizedAmountCents = dollarsToCents(inquireResponse.amount);
          } else if (resolvedStatus === 'captured' && inquireResponse.amount) {
            updateData.capturedAmountCents = dollarsToCents(inquireResponse.amount);
            updateData.authorizedAmountCents = dollarsToCents(inquireResponse.amount);
          }

          const [updated] = await tx
            .update(paymentIntents)
            .set(updateData)
            .where(eq(paymentIntents.id, intent.id))
            .returning();

          // Emit appropriate event for the status resolution
          const eventType =
            resolvedStatus === 'captured'
              ? PAYMENT_GATEWAY_EVENTS.CAPTURED
              : resolvedStatus === 'authorized'
                ? PAYMENT_GATEWAY_EVENTS.AUTHORIZED
                : PAYMENT_GATEWAY_EVENTS.DECLINED;

          const event = buildEventFromContext(ctx, eventType, {
            paymentIntentId: intent.id,
            tenantId: ctx.tenantId,
            locationId: intent.locationId,
            amountCents: intent.amountCents,
            providerRef: latestTxn.providerRef,
            orderId: intent.orderId ?? null,
            customerId: intent.customerId ?? null,
            ...(resolvedStatus === 'authorized' && {
              merchantAccountId: intent.merchantAccountId,
              authorizedAmountCents: dollarsToCents(inquireResponse.amount),
              currency: intent.currency,
              cardLast4: intent.cardLast4 ?? null,
              cardBrand: intent.cardBrand ?? null,
              paymentMethodType: intent.paymentMethodType ?? 'card',
            }),
            ...(resolvedStatus === 'captured' && {
              merchantAccountId: intent.merchantAccountId,
              capturedAmountCents: dollarsToCents(inquireResponse.amount),
              currency: intent.currency,
              tenderId: intent.tenderId ?? null,
            }),
            ...(resolvedStatus === 'declined' && {
              responseCode: inquireResponse.responseCode || null,
              responseText: inquireResponse.responseText || null,
              paymentMethodType: intent.paymentMethodType ?? 'card',
            }),
          });

          return { result: mapIntentToResult(updated!, latestTxn.providerRef, interpretation), events: [event] };
        }
      }
    }

    // No status change — return current state
    return { result: mapIntentToResult(intent, latestTxn.providerRef, interpretation), events: [] };
  });

  await auditLog(ctx, 'payment.inquired', 'payment_intent', result.id);
  return result;
}

function mapIntentToResult(
  intent: Record<string, any>,
  providerRef?: string | null,
  interpretation?: ResponseInterpretation | null,
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
