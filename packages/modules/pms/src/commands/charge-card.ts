/**
 * Charge a guest's card (direct capture, no auth hold).
 * Posts a PAYMENT folio entry on success.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsPaymentMethods, pmsPaymentTransactions, pmsReservations, pmsFolios, pmsFolioEntries } from '@oppsera/db';
import type { ChargeCardInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { getPaymentGateway } from '../helpers/stripe-gateway';
import { recalculateFolioTotals } from '../helpers/folio-totals';

export async function chargeCard(ctx: RequestContext, input: ChargeCardInput) {
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

    // Load folio
    const [folio] = await tx
      .select()
      .from(pmsFolios)
      .where(and(eq(pmsFolios.id, input.folioId), eq(pmsFolios.tenantId, ctx.tenantId)))
      .limit(1);
    if (!folio) throw new NotFoundError('Folio', input.folioId);
    if (folio.status !== 'OPEN') {
      throw new ValidationError('Folio is not open', [
        { field: 'folioId', message: 'Folio must be OPEN to charge' },
      ]);
    }

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

    // Charge via gateway
    const gateway = getPaymentGateway();
    const gatewayResult = await gateway.createPaymentIntent({
      customerId: pm.gatewayCustomerId,
      amountCents: input.amountCents,
      currency: 'USD',
      paymentMethodId: pm.gatewayPaymentMethodId,
      capture: true,
      idempotencyKey: input.idempotencyKey,
      description: input.description ?? `Payment for reservation ${reservation.confirmationNumber ?? input.reservationId}`,
    });

    const txnId = generateUlid();
    const status = gatewayResult.status === 'succeeded' ? 'succeeded' : 'failed';

    await tx.insert(pmsPaymentTransactions).values({
      id: txnId,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      folioId: input.folioId,
      reservationId: input.reservationId,
      paymentMethodId: input.paymentMethodId,
      gateway: pm.gateway,
      gatewayChargeId: gatewayResult.chargeId,
      transactionType: 'charge',
      amountCents: input.amountCents,
      currency: 'USD',
      status,
      description: input.description ?? 'Card payment',
      idempotencyKey: input.idempotencyKey,
      failureReason: status === 'failed' ? 'Gateway charge failed' : null,
      createdBy: ctx.user.id,
    });

    // Post folio entry on success
    if (status === 'succeeded') {
      const entryId = generateUlid();
      const businessDate = new Date().toISOString().split('T')[0]!;
      await tx.insert(pmsFolioEntries).values({
        id: entryId,
        tenantId: ctx.tenantId,
        folioId: input.folioId,
        entryType: 'PAYMENT',
        description: input.description ?? `Card payment (****${pm.cardLastFour ?? '****'})`,
        amountCents: -input.amountCents, // negative = payment/credit
        businessDate,
        sourceRef: txnId,
        postedBy: ctx.user.id,
      });
      await recalculateFolioTotals(tx, ctx.tenantId, input.folioId);
    }

    await pmsAuditLogEntry(tx, ctx, input.reservationId, 'payment', txnId, 'card_charged', {
      amountCents: input.amountCents,
      status,
      cardLastFour: pm.cardLastFour,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.PAYMENT_CHARGED, {
      transactionId: txnId,
      reservationId: input.reservationId,
      folioId: input.folioId,
      amountCents: input.amountCents,
      status,
    });

    return { result: { id: txnId, status, gatewayChargeId: gatewayResult.chargeId }, events: [event] };
  });

  await auditLog(ctx, 'pms.payment.charged', 'pms_payment_transaction', result.id);
  return result;
}
