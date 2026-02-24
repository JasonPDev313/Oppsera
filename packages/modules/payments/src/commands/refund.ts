import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { paymentIntents, paymentTransactions } from '@oppsera/db';
import { eq, and, desc } from 'drizzle-orm';
import type { RefundPaymentInput } from '../gateway-validation';
import type { PaymentIntentResult } from '../types/gateway-results';
import { PAYMENT_GATEWAY_EVENTS, assertIntentTransition } from '../events/gateway-types';
import { resolveProvider } from '../helpers/resolve-provider';
import { centsToDollars, dollarsToCents } from '../helpers/amount';

export async function refundPayment(
  ctx: RequestContext,
  input: RefundPaymentInput,
): Promise<PaymentIntentResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
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

    // 2. Validate status — must be captured (post-settlement refund)
    if (intent.status !== 'captured') {
      throw new AppError(
        'INVALID_REFUND_STATUS',
        `Cannot refund a payment in status "${intent.status}". Must be "captured".`,
        409,
      );
    }

    // 3. Calculate refund amount and validate
    const alreadyRefunded = intent.refundedAmountCents ?? 0;
    const captured = intent.capturedAmountCents ?? intent.amountCents;
    const refundAmountCents = input.amountCents ?? (captured - alreadyRefunded);

    if (refundAmountCents <= 0) {
      throw new AppError('INVALID_REFUND_AMOUNT', 'Refund amount must be greater than zero', 400);
    }

    if (refundAmountCents > captured - alreadyRefunded) {
      throw new AppError(
        'REFUND_EXCEEDS_CAPTURED',
        `Refund amount ${refundAmountCents} exceeds remaining refundable amount ${captured - alreadyRefunded}`,
        400,
      );
    }

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

    // 6. Call provider refund
    const refundResponse = await provider.refund({
      merchantId,
      providerRef: latestTxn.providerRef,
      amount: centsToDollars(refundAmountCents),
    });

    // 7. Insert payment transaction
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
    });

    // 8. Update intent
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

    // 9. Build event
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
      return { result: mapIntentToResult(updated!), events: [event] };
    }

    return { result: mapIntentToResult(updated!), events: [] };
  });

  await auditLog(ctx, 'payment.refunded', 'payment_intent', result.id);
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
