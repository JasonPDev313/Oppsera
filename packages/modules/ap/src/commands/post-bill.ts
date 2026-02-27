import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { apBills, apBillLines, vendors } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import { BillStatusError } from '../errors';
import { AP_EVENTS } from '../events/types';
import type { PostBillInput } from '../validation';

export async function postBill(ctx: RequestContext, input: PostBillInput) {
  const accountingApi = getAccountingPostingApi();

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'postBill');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 1. Load bill
    const [bill] = await tx
      .select()
      .from(apBills)
      .where(
        and(
          eq(apBills.id, input.billId),
          eq(apBills.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!bill) {
      throw new NotFoundError('Bill', input.billId);
    }

    if (bill.status !== 'draft') {
      throw new BillStatusError(input.billId, bill.status, 'draft');
    }

    // 2. Idempotency: if bill already has a GL entry, it was already posted
    if (bill.glJournalEntryId) {
      return { result: bill, events: [] };
    }

    // 3. Load bill lines
    const lines = await tx
      .select()
      .from(apBillLines)
      .where(eq(apBillLines.billId, input.billId));

    if (lines.length === 0) {
      throw new AppError('EMPTY_BILL', 'Cannot post a bill with no lines', 400);
    }

    // 4. Load vendor for AP account override
    const [vendor] = await tx
      .select()
      .from(vendors)
      .where(
        and(
          eq(vendors.id, bill.vendorId),
          eq(vendors.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    // 5. Resolve AP control account
    let apControlAccountId: string | null = vendor?.defaultAPAccountId ?? null;

    if (!apControlAccountId) {
      const settings = await accountingApi.getSettings(ctx.tenantId);
      apControlAccountId = settings.defaultAPControlAccountId;
    }

    if (!apControlAccountId) {
      throw new AppError(
        'NO_AP_CONTROL_ACCOUNT',
        'No AP control account configured. Set a default on the vendor or in accounting settings.',
        400,
      );
    }

    // 6. Build GL journal lines
    // Debit: each line's account for line.amount
    // Credit: AP control account for totalAmount
    const glLines: Array<{
      accountId: string;
      debitAmount?: string;
      creditAmount?: string;
      locationId?: string;
      departmentId?: string;
      vendorId?: string;
      memo?: string;
    }> = [];

    for (const line of lines) {
      glLines.push({
        accountId: line.accountId,
        debitAmount: line.amount,
        creditAmount: '0',
        locationId: line.locationId ?? bill.locationId ?? undefined,
        departmentId: line.departmentId ?? undefined,
        vendorId: bill.vendorId,
        memo: line.description ?? undefined,
      });
    }

    // Credit AP control for the total
    glLines.push({
      accountId: apControlAccountId,
      debitAmount: '0',
      creditAmount: bill.totalAmount,
      vendorId: bill.vendorId,
      memo: `AP Bill ${bill.billNumber}`,
    });

    // 7. Post GL entry via AccountingPostingApi
    const businessDate = input.businessDate ?? bill.billDate;
    const glResult = await accountingApi.postEntry(ctx, {
      businessDate,
      sourceModule: 'ap',
      sourceReferenceId: bill.id,
      memo: `AP Bill ${bill.billNumber}${bill.memo ? ` - ${bill.memo}` : ''}`,
      currency: bill.currency,
      lines: glLines,
      forcePost: input.forcePost ?? false,
    });

    // 8. Update bill status to posted
    const [posted] = await tx
      .update(apBills)
      .set({
        status: 'posted',
        glJournalEntryId: glResult.id,
        postedAt: new Date(),
        postedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(apBills.id, input.billId))
      .returning();

    // 9. Emit bill posted event
    const event = buildEventFromContext(ctx, AP_EVENTS.BILL_POSTED, {
      billId: bill.id,
      vendorId: bill.vendorId,
      billNumber: bill.billNumber,
      totalAmount: bill.totalAmount,
      glJournalEntryId: glResult.id,
      businessDate,
    });

    const resultPayload = { ...posted!, lines, glJournalEntryId: glResult.id };
    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'postBill', resultPayload);

    return {
      result: resultPayload,
      events: [event],
    };
  });

  await auditLog(ctx, 'ap.bill.posted', 'ap_bill', result.id);
  return result;
}
