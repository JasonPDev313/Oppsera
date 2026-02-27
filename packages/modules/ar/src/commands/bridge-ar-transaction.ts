import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import { arInvoices, arReceipts } from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';

interface BridgeArTransactionInput {
  arTransactionId: string;
  clientRequestId?: string;
}

export async function bridgeArTransaction(ctx: RequestContext, input: BridgeArTransactionInput) {
  const result = await publishWithOutbox(ctx, async (tx): Promise<{ result: any; events: any[] }> => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'bridgeArTransaction');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 1. Load the ar_transaction
    const rows = await tx.execute(sql`
      SELECT id, tenant_id, billing_account_id, transaction_type, amount, description,
             business_date, created_at, customer_id
      FROM ar_transactions
      WHERE id = ${input.arTransactionId}
        AND tenant_id = ${ctx.tenantId}
      LIMIT 1
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) {
      throw new AppError('AR_TRANSACTION_NOT_FOUND', `AR transaction ${input.arTransactionId} not found`, 404);
    }

    const arTx = arr[0]!;
    const txType = String(arTx.transaction_type);
    const amount = Number(arTx.amount);
    const customerId = String(arTx.customer_id ?? arTx.billing_account_id);
    const businessDate = String(arTx.business_date);
    const description = arTx.description ? String(arTx.description) : 'Bridged AR transaction';

    if (txType === 'charge' || txType === 'late_fee') {
      // Create an invoice
      const invoiceId = generateUlid();
      const invoiceNumber = `BR-${input.arTransactionId.slice(-8)}`;

      const [invoice] = await tx
        .insert(arInvoices)
        .values({
          id: invoiceId,
          tenantId: ctx.tenantId,
          customerId,
          invoiceNumber,
          invoiceDate: businessDate,
          dueDate: businessDate,
          status: 'posted',
          memo: description,
          currency: 'USD',
          totalAmount: amount.toFixed(2),
          amountPaid: '0',
          balanceDue: amount.toFixed(2),
          sourceType: 'pos_house_account',
          sourceReferenceId: input.arTransactionId,
          createdBy: ctx.user.id,
        })
        .returning();

      const invoiceResult = { type: 'invoice' as const, ...invoice! };
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'bridgeArTransaction', invoiceResult);
      return { result: invoiceResult, events: [] };

    } else if (txType === 'payment' || txType === 'credit_memo') {
      // Create a receipt
      const receiptId = generateUlid();

      const [receipt] = await tx
        .insert(arReceipts)
        .values({
          id: receiptId,
          tenantId: ctx.tenantId,
          customerId,
          receiptDate: businessDate,
          amount: Math.abs(amount).toFixed(2),
          currency: 'USD',
          status: 'posted',
          sourceType: 'pos_tender',
          sourceReferenceId: input.arTransactionId,
          createdBy: ctx.user.id,
        })
        .returning();

      const receiptResult = { type: 'receipt' as const, ...receipt! };
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'bridgeArTransaction', receiptResult);
      return { result: receiptResult, events: [] };
    }

    throw new AppError('UNSUPPORTED_TX_TYPE', `Unsupported AR transaction type: ${txType}`, 400);
  });

  await auditLog(ctx, 'ar.transaction.bridged', 'ar_transaction', input.arTransactionId);
  return result;
}
