import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { apBills, apBillLines, vendors } from '@oppsera/db';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';
import { AP_EVENTS } from '../events/types';

interface CreateVendorCreditInput {
  vendorId: string;
  creditNumber: string;
  creditDate: string;
  memo?: string;
  lines: Array<{
    accountId: string;
    description?: string;
    amount: string; // positive value — will be stored as negative on the bill
  }>;
  clientRequestId?: string;
}

export async function createVendorCredit(ctx: RequestContext, input: CreateVendorCreditInput) {
  const accountingApi = getAccountingPostingApi();

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createVendorCredit');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 1. Validate vendor
    const [vendor] = await tx
      .select()
      .from(vendors)
      .where(and(eq(vendors.id, input.vendorId), eq(vendors.tenantId, ctx.tenantId)))
      .limit(1);
    if (!vendor) throw new NotFoundError('Vendor', input.vendorId);

    // 2. Compute total
    const creditTotal = input.lines.reduce((sum, l) => sum + Number(l.amount), 0);
    const negativeTotal = (-creditTotal).toFixed(2);

    // 3. Resolve AP control
    let apControlAccountId = vendor.defaultAPAccountId ?? null;
    if (!apControlAccountId) {
      const settings = await accountingApi.getSettings(ctx.tenantId);
      apControlAccountId = settings.defaultAPControlAccountId;
    }
    if (!apControlAccountId) {
      throw new AppError('NO_AP_CONTROL_ACCOUNT', 'No AP control account configured', 400);
    }

    // 4. Create bill with negative total (credit memo)
    const billId = generateUlid();
    const [bill] = await tx
      .insert(apBills)
      .values({
        id: billId,
        tenantId: ctx.tenantId,
        vendorId: input.vendorId,
        billNumber: input.creditNumber,
        billDate: input.creditDate,
        dueDate: input.creditDate,
        status: 'posted',
        memo: input.memo ?? 'Vendor Credit',
        currency: 'USD',
        totalAmount: negativeTotal,
        amountPaid: '0',
        balanceDue: negativeTotal,
        postedAt: new Date(),
        postedBy: ctx.user.id,
        createdBy: ctx.user.id,
      })
      .returning();

    // 5. Insert credit lines (amounts stored as negative)
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i]!;
      await tx.insert(apBillLines).values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        billId,
        lineType: 'expense',
        accountId: line.accountId,
        description: line.description ?? null,
        quantity: '1',
        unitCost: '0',
        amount: (-Number(line.amount)).toFixed(2),
        taxAmount: '0',
        sortOrder: i,
      });
    }

    // 6. Post GL: Debit AP control, Credit expense accounts
    const glLines = input.lines.map((line) => ({
      accountId: line.accountId,
      debitAmount: '0',
      creditAmount: line.amount, // positive amount for the credit
      vendorId: input.vendorId,
    }));
    glLines.push({
      accountId: apControlAccountId,
      debitAmount: creditTotal.toFixed(2),
      creditAmount: '0',
      vendorId: input.vendorId,
    });

    const glResult = await accountingApi.postEntry(ctx, {
      businessDate: input.creditDate,
      sourceModule: 'ap',
      sourceReferenceId: billId,
      memo: `Vendor Credit ${input.creditNumber}${input.memo ? ` - ${input.memo}` : ''}`,
      currency: 'USD',
      lines: glLines,
      forcePost: true,
    });

    // 7. Update bill with GL link
    await tx
      .update(apBills)
      .set({ glJournalEntryId: glResult.id })
      .where(eq(apBills.id, billId));

    const event = buildEventFromContext(ctx, AP_EVENTS.BILL_POSTED, {
      billId,
      vendorId: input.vendorId,
      billNumber: input.creditNumber,
      totalAmount: negativeTotal,
      glJournalEntryId: glResult.id,
      businessDate: input.creditDate,
    });

    const creditResult = { ...bill!, glJournalEntryId: glResult.id };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createVendorCredit', creditResult);
    return { result: creditResult, events: [event] };
  });

  await auditLog(ctx, 'ap.vendor_credit.created', 'ap_bill', result.id);
  return result;
}
