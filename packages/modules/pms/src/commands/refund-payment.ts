/**
 * Refund a payment transaction (full or partial).
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsPaymentTransactions, pmsFolioEntries } from '@oppsera/db';
import type { RefundPaymentInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { getPaymentGateway } from '../helpers/stripe-gateway';
import { recalculateFolioTotals } from '../helpers/folio-totals';

export async function refundPayment(ctx: RequestContext, input: RefundPaymentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'refundPayment');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

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
    if (txn.status !== 'succeeded' && txn.status !== 'captured') {
      throw new ValidationError('Transaction cannot be refunded', [
        { field: 'transactionId', message: `Current status: ${txn.status}` },
      ]);
    }
    if (!txn.gatewayChargeId) {
      throw new ValidationError('No gateway charge ID to refund', [
        { field: 'transactionId', message: 'Missing gatewayChargeId' },
      ]);
    }

    const refundAmount = input.amountCents ?? txn.amountCents;
    if (refundAmount > txn.amountCents) {
      throw new ValidationError('Refund amount exceeds original charge', [
        { field: 'amountCents', message: `Max refundable: ${txn.amountCents}` },
      ]);
    }

    const gateway = getPaymentGateway();
    const gatewayResult = await gateway.refund({
      chargeId: txn.gatewayChargeId,
      amountCents: refundAmount,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });

    const refundTxnId = generateUlid();
    const status = gatewayResult.status === 'succeeded' ? 'refunded' : 'failed';

    await tx.insert(pmsPaymentTransactions).values({
      id: refundTxnId,
      tenantId: ctx.tenantId,
      propertyId: txn.propertyId,
      folioId: txn.folioId,
      reservationId: txn.reservationId,
      paymentMethodId: txn.paymentMethodId,
      gateway: txn.gateway,
      gatewayChargeId: txn.gatewayChargeId,
      gatewayRefundId: gatewayResult.refundId,
      transactionType: 'refund',
      amountCents: refundAmount,
      currency: txn.currency,
      status,
      description: `Refund${input.reason ? `: ${input.reason}` : ''}`,
      idempotencyKey: input.idempotencyKey,
      createdBy: ctx.user.id,
    });

    // Post refund folio entry on success
    if (status === 'refunded' && txn.folioId) {
      const entryId = generateUlid();
      const businessDate = new Date().toISOString().split('T')[0]!;
      await tx.insert(pmsFolioEntries).values({
        id: entryId,
        tenantId: ctx.tenantId,
        folioId: txn.folioId,
        entryType: 'REFUND',
        description: `Refund${input.reason ? `: ${input.reason}` : ''}`,
        amountCents: refundAmount, // positive = refund/debit back to folio
        businessDate,
        sourceRef: refundTxnId,
        postedBy: ctx.user.id,
      });
      await recalculateFolioTotals(tx, ctx.tenantId, txn.folioId);
    }

    // Update original transaction status
    if (status === 'refunded' && refundAmount >= txn.amountCents) {
      await tx
        .update(pmsPaymentTransactions)
        .set({ status: 'refunded', updatedAt: new Date() })
        .where(
          and(
            eq(pmsPaymentTransactions.id, input.transactionId),
            eq(pmsPaymentTransactions.tenantId, ctx.tenantId),
          ),
        );
    }

    await pmsAuditLogEntry(tx, ctx, txn.propertyId, 'payment', refundTxnId, 'refunded', {
      originalTransactionId: input.transactionId,
      amountCents: refundAmount,
      status,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.PAYMENT_REFUNDED, {
      transactionId: refundTxnId,
      originalTransactionId: input.transactionId,
      reservationId: txn.reservationId,
      amountCents: refundAmount,
      status,
    });

    const resultPayload = { id: refundTxnId, status, refundId: gatewayResult.refundId };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'refundPayment', resultPayload);
    return { result: resultPayload, events: [event] };
  });

  await auditLog(ctx, 'pms.payment.refunded', 'pms_payment_transaction', result.id);
  return result;
}
