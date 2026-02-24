/**
 * Authorize (hold) a deposit on a guest's card.
 * Creates a payment transaction with type 'authorization'.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsPaymentMethods, pmsPaymentTransactions, pmsReservations } from '@oppsera/db';
import type { AuthorizeDepositInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { getPaymentGateway } from '../helpers/stripe-gateway';

export async function authorizeDeposit(ctx: RequestContext, input: AuthorizeDepositInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load reservation
    const [reservation] = await tx
      .select()
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.id, input.reservationId),
          eq(pmsReservations.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    if (!reservation) throw new NotFoundError('Reservation', input.reservationId);

    // Load payment method
    const [pm] = await tx
      .select()
      .from(pmsPaymentMethods)
      .where(
        and(
          eq(pmsPaymentMethods.id, input.paymentMethodId),
          eq(pmsPaymentMethods.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    if (!pm) throw new NotFoundError('PaymentMethod', input.paymentMethodId);
    if (!pm.gatewayCustomerId || !pm.gatewayPaymentMethodId) {
      throw new ValidationError('Payment method not fully configured', [
        { field: 'paymentMethodId', message: 'Missing gateway credentials' },
      ]);
    }

    // Create authorization via gateway
    const gateway = getPaymentGateway();
    const gatewayResult = await gateway.createPaymentIntent({
      customerId: pm.gatewayCustomerId,
      amountCents: input.amountCents,
      currency: 'USD',
      paymentMethodId: pm.gatewayPaymentMethodId,
      capture: false,
      idempotencyKey: input.idempotencyKey,
      description: `Deposit for reservation ${reservation.confirmationNumber ?? input.reservationId}`,
    });

    const txnId = generateUlid();
    const status = gatewayResult.status === 'requires_capture' ? 'authorized' : gatewayResult.status === 'succeeded' ? 'captured' : 'failed';

    await tx.insert(pmsPaymentTransactions).values({
      id: txnId,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      folioId: input.folioId ?? null,
      reservationId: input.reservationId,
      paymentMethodId: input.paymentMethodId,
      gateway: pm.gateway,
      gatewayChargeId: gatewayResult.chargeId,
      transactionType: 'authorization',
      amountCents: input.amountCents,
      currency: 'USD',
      status,
      description: `Deposit authorization`,
      idempotencyKey: input.idempotencyKey,
      createdBy: ctx.user.id,
    });

    // Update reservation deposit tracking
    await tx
      .update(pmsReservations)
      .set({
        depositAmountCents: input.amountCents,
        paymentMethodId: input.paymentMethodId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pmsReservations.id, input.reservationId),
          eq(pmsReservations.tenantId, ctx.tenantId),
        ),
      );

    await pmsAuditLogEntry(tx, ctx, reservation.propertyId, 'payment', txnId, 'deposit_authorized', {
      amountCents: input.amountCents,
      status,
      gatewayChargeId: gatewayResult.chargeId,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.PAYMENT_AUTHORIZED, {
      transactionId: txnId,
      reservationId: input.reservationId,
      amountCents: input.amountCents,
      status,
    });

    return { result: { id: txnId, status, gatewayChargeId: gatewayResult.chargeId }, events: [event] };
  });

  await auditLog(ctx, 'pms.payment.authorized', 'pms_payment_transaction', result.id);
  return result;
}
