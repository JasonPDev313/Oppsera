import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import { arInvoices, arInvoiceLines, customers } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { AR_EVENTS } from '../events/types';

interface CreateInvoiceInput {
  customerId: string;
  billingAccountId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  memo?: string;
  locationId?: string;
  sourceType: string;
  sourceReferenceId?: string;
  clientRequestId?: string;
  lines: Array<{
    accountId: string;
    description: string;
    quantity?: string;
    unitPrice?: string;
    amount: string;
    taxGroupId?: string;
    taxAmount?: string;
  }>;
}

export async function createInvoice(ctx: RequestContext, input: CreateInvoiceInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createInvoice');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Validate customer exists
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    const invoiceId = generateUlid();

    // Compute total from lines
    let totalAmount = 0;
    for (const line of input.lines) {
      totalAmount += Number(line.amount) + Number(line.taxAmount ?? '0');
    }
    const totalAmountStr = totalAmount.toFixed(2);

    // Create invoice
    const [invoice] = await tx
      .insert(arInvoices)
      .values({
        id: invoiceId,
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        billingAccountId: input.billingAccountId ?? null,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        status: 'draft',
        memo: input.memo ?? null,
        locationId: input.locationId ?? null,
        currency: 'USD',
        totalAmount: totalAmountStr,
        amountPaid: '0',
        balanceDue: totalAmountStr,
        sourceType: input.sourceType,
        sourceReferenceId: input.sourceReferenceId ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    // Insert lines
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i]!;
      await tx.insert(arInvoiceLines).values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        invoiceId,
        accountId: line.accountId,
        description: line.description,
        quantity: line.quantity ?? '1',
        unitPrice: line.unitPrice ?? '0',
        amount: line.amount,
        taxGroupId: line.taxGroupId ?? null,
        taxAmount: line.taxAmount ?? '0',
        sortOrder: i,
      });
    }

    const event = buildEventFromContext(ctx, AR_EVENTS.INVOICE_CREATED, {
      invoiceId,
      customerId: input.customerId,
      invoiceNumber: input.invoiceNumber,
      totalAmount: totalAmountStr,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createInvoice', invoice!);
    return { result: invoice!, events: [event] };
  });

  await auditLog(ctx, 'ar.invoice.created', 'ar_invoice', result.id);
  return result;
}
