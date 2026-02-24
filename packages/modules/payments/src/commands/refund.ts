import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { paymentIntents, paymentTransactions } from '@oppsera/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { RefundPaymentInput } from '../gateway-validation';
import type { PaymentIntentResult } from '../types/gateway-results';
import { PAYMENT_GATEWAY_EVENTS, assertIntentTransition } from '../events/gateway-types';
import { resolveProvider } from '../helpers/resolve-provider';
import { centsToDollars, dollarsToCents } from '../helpers/amount';
import { interpretResponse } from '../services/response-interpreter';
import type { ResponseInterpretation } from '../services/response-interpreter';

export async function refundPayment(
  ctx: RequestContext,
  input: RefundPaymentInput,
): Promise<PaymentIntentResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load payment intent with FOR UPDATE lock (prevents concurrent refund race / double-refund)
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

    // 2. Idempotency — check if this clientRequestId was already processed for this intent
    const [existingRefundTxn] = await tx
      .select()
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.paymentIntentId, input.paymentIntentId),
          eq(paymentTransactions.tenantId, ctx.tenantId),
          eq(paymentTransactions.transactionType, 'refund'),
          eq(paymentTransactions.clientRequestId, input.clientRequestId),
        ),
      )
      .limit(1);

    if (existingRefundTxn && existingRefundTxn.responseStatus === 'approved') {
      // Already processed this exact refund — return current intent (idempotent replay)
      return { result: mapIntentToResult(intent, null), events: [] };
    }

    // 3. Validate status — must be captured (or ach_settled/ach_originated for ACH)
    const isAch = intent.paymentMethodType === 'ach';
    const validRefundStatuses = isAch
      ? ['captured', 'ach_settled', 'ach_originated']
      : ['captured'];

    if (!validRefundStatuses.includes(intent.status)) {
      throw new AppError(
        'INVALID_REFUND_STATUS',
        `Cannot refund a payment in status "${intent.status}". Must be "${validRefundStatuses.join('" or "')}".`,
        409,
      );
    }

    // 4. Calculate refund amount and validate
    const alreadyRefunded = intent.refundedAmountCents ?? 0;
    const captured = intent.capturedAmountCents ?? intent.amountCents;
    const refundAmountCents = input.amountCents ?? (captured - alreadyRefunded);

    if (refundAmountCents <= 0) {
      throw new AppError('INVALID_REFUND_AMOUNT', 'Refund amount must be greater than zero', 400);
    }

    // NACHA rule: ACH reversals must be exact amount match — no partial ACH refunds
    if (isAch && refundAmountCents !== intent.amountCents) {
      throw new AppError(
        'ACH_PARTIAL_REFUND_NOT_ALLOWED',
        'ACH reversals must match the original transaction amount exactly. Partial ACH refunds are not allowed per NACHA rules.',
        400,
      );
    }

    if (refundAmountCents > captured - alreadyRefunded) {
      throw new AppError(
        'REFUND_EXCEEDS_CAPTURED',
        `Refund amount ${refundAmountCents} exceeds remaining refundable amount ${captured - alreadyRefunded}`,
        400,
      );
    }

    // 5. Get latest provider ref
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

    // 6. Resolve provider
    const { provider, merchantId } = await resolveProvider(
      ctx.tenantId,
      intent.locationId,
    );

    // 7. Call provider refund (ACH uses auth endpoint with achDescription='Reversal')
    let refundResponse;
    if (isAch) {
      // NACHA reversal: must use same SEC code, achDescription='Reversal', exact amount
      refundResponse = await provider.sale({
        merchantId,
        amount: centsToDollars(refundAmountCents),
        currency: intent.currency ?? 'USD',
        token: intent.token ?? '',
        orderId: `REV-${intent.providerOrderId?.slice(0, 14) ?? 'ach'}`,
        capture: 'Y',
        ecomind: 'E',
        achAccountType: (intent as any).achAccountType ?? 'ECHK',
        achSecCode: (intent as any).achSecCode ?? 'WEB',
        achDescription: 'Reversal',
      });
    } else {
      refundResponse = await provider.refund({
        merchantId,
        providerRef: latestTxn.providerRef,
        amount: centsToDollars(refundAmountCents),
      });
    }

    // 8. Interpret response
    const interpretation = interpretResponse({
      responseCode: refundResponse.responseCode || null,
      responseText: refundResponse.responseText || null,
      respstat: (refundResponse.rawResponse as Record<string, unknown>)?.respstat as string ?? null,
      avsResponse: null,
      cvvResponse: null,
      rawResponse: refundResponse.rawResponse as Record<string, unknown>,
    });

    // 9. Insert payment transaction
    await tx.insert(paymentTransactions).values({
      tenantId: ctx.tenantId,
      paymentIntentId: intent.id,
      transactionType: 'refund',
      providerRef: refundResponse.providerRef,
      amountCents: refundAmountCents,
      responseStatus: refundResponse.status,
      responseCode: refundResponse.responseCode || null,
      responseText: refundResponse.responseText || null,
      providerResponse: refundResponse.rawResponse,
      clientRequestId: input.clientRequestId,
      declineCategory: interpretation.declineCategory,
      userMessage: interpretation.userMessage,
      suggestedAction: interpretation.suggestedAction,
      retryable: interpretation.retryable,
      processor: interpretation.processor,
    });

    // 10. Update intent
    let newStatus: string;
    let errorMessage: string | null = null;
    let newRefundedTotal = alreadyRefunded;

    if (refundResponse.status === 'approved') {
      newRefundedTotal = alreadyRefunded + dollarsToCents(refundResponse.amount);
      // Full refund → 'refunded', partial → stay 'captured'
      if (newRefundedTotal >= captured) {
        newStatus = 'refunded';
      } else {
        newStatus = 'captured'; // partial refund — remain captured
      }
    } else {
      // Refund declined — CardPointe does real-time refund authorizations
      newStatus = intent.status; // keep current status
      errorMessage = refundResponse.responseText;
    }

    const [updated] = await tx
      .update(paymentIntents)
      .set({
        status: newStatus,
        refundedAmountCents: newRefundedTotal,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, intent.id))
      .returning();

    // 11. Build event
    if (refundResponse.status === 'approved') {
      const event = buildEventFromContext(ctx, PAYMENT_GATEWAY_EVENTS.REFUNDED, {
        paymentIntentId: intent.id,
        tenantId: ctx.tenantId,
        locationId: intent.locationId,
        amountCents: intent.amountCents,
        refundedAmountCents: newRefundedTotal,
        orderId: intent.orderId,
        customerId: intent.customerId,
        providerRef: refundResponse.providerRef,
      });
      return { result: mapIntentToResult(updated!, interpretation), events: [event] };
    }

    return { result: mapIntentToResult(updated!, interpretation), events: [] };
  });

  await auditLog(ctx, 'payment.refunded', 'payment_intent', result.id);
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
