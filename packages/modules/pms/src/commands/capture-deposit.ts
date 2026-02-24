/**
 * Capture a previously authorized deposit.
 */
import { and, eq, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsPaymentTransactions, pmsReservations } from '@oppsera/db';
import type { CaptureDepositInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { getPaymentGateway } from '../helpers/stripe-gateway';

export async function captureDeposit(ctx: RequestContext, input: CaptureDepositInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [txn] = await tx
      .select()
      .from(pmsPaymentTransactions)
      .where(
        and(
          eq(pmsPaymentTransactions.id, input.transactionId),
          eq(pmsPaymentTransactions.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    if (!txn) throw new NotFoundError('PaymentTransaction', input.transactionId);
    if (txn.status !== 'authorized') {
      throw new ValidationError('Transaction is not in authorized status', [
        { field: 'transactionId', message: `Current status: ${txn.status}` },
      ]);
    }
    if (!txn.gatewayChargeId) {
      throw new ValidationError('No gateway charge ID to capture', [
        { field: 'transactionId', message: 'Missing gatewayChargeId' },
      ]);
    }

    const captureAmount = input.amountCents ?? txn.amountCents;
    const gateway = getPaymentGateway();
    const gatewayResult = await gateway.capturePaymentIntent(txn.gatewayChargeId, captureAmount);

    const newStatus = gatewayResult.status === 'succeeded' ? 'captured' : 'failed';

    await tx
      .update(pmsPaymentTransactions)
      .set({
        status: newStatus,
        transactionType: 'capture',
        amountCents: captureAmount,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pmsPaymentTransactions.id, input.transactionId),
          eq(pmsPaymentTransactions.tenantId, ctx.tenantId),
        ),
      );

    // Update reservation deposit paid
    if (newStatus === 'captured' && txn.reservationId) {
      await tx
        .update(pmsReservations)
        .set({
          depositPaidCents: sql`deposit_paid_cents + ${captureAmount}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(pmsReservations.id, txn.reservationId),
            eq(pmsReservations.tenantId, ctx.tenantId),
          ),
        );
    }

    await pmsAuditLogEntry(tx, ctx, txn.propertyId, 'payment', input.transactionId, 'deposit_captured', {
      amountCents: captureAmount,
      status: newStatus,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.PAYMENT_CAPTURED, {
      transactionId: input.transactionId,
      reservationId: txn.reservationId,
      amountCents: captureAmount,
      status: newStatus,
    });

    return { result: { id: input.transactionId, status: newStatus, amountCents: captureAmount }, events: [event] };
  });

  await auditLog(ctx, 'pms.payment.captured', 'pms_payment_transaction', result.id);
  return result;
}
