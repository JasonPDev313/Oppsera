import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { getAccountingPostingApi } from '@oppsera/core/helpers';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { expenses } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export async function postExpense(ctx: RequestContext, expenseId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.tenantId, ctx.tenantId), eq(expenses.id, expenseId)));

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Expense not found', 404);
    }

    if (existing.status !== 'approved') {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot post expense in '${existing.status}' status`,
        400,
      );
    }

    if (!existing.glAccountId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Expense must have a GL account assigned before posting',
        400,
      );
    }

    // Post GL entry: Dr Expense Account / Cr Employee Reimbursable (or Petty Cash)
    const postingApi = getAccountingPostingApi();
    const settings = await postingApi.getSettings(ctx.tenantId);

    const amount = Number(existing.amount);

    // Credit side: use AP control account (expense creates a payable until reimbursed)
    const creditAccountId = settings?.defaultAPControlAccountId;

    if (!creditAccountId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Default AP control account not configured in accounting settings',
        400,
      );
    }

    const glResult = await postingApi.postEntry(
      {
        ...ctx,
        requestId: `expense-post-${expenseId}`,
      },
      {
        sourceModule: 'expense_management',
        sourceReferenceId: expenseId,
        businessDate: existing.expenseDate,
        memo: `Expense ${existing.expenseNumber}: ${existing.category}${existing.vendorName ? ` - ${existing.vendorName}` : ''}`,
        lines: [
          {
            accountId: existing.glAccountId,
            debitAmount: amount.toFixed(2),
            creditAmount: '0.00',
            memo: existing.description ?? `${existing.category} expense`,
            locationId: existing.locationId ?? undefined,
            channel: 'expense',
          },
          {
            accountId: creditAccountId,
            debitAmount: '0.00',
            creditAmount: amount.toFixed(2),
            memo: `${existing.expenseNumber} - Expense Payable`,
            locationId: existing.locationId ?? undefined,
            channel: 'expense',
          },
        ],
        forcePost: true,
      },
    );

    const now = new Date();
    const [updated] = await tx
      .update(expenses)
      .set({
        status: 'posted',
        postedAt: now,
        postedBy: ctx.user.id,
        glJournalEntryId: glResult?.id ?? null,
        updatedAt: now,
        version: existing.version + 1,
      })
      .where(eq(expenses.id, expenseId))
      .returning();

    const event = buildEventFromContext(ctx, 'expense.posted.v1', {
      expenseId,
      amount,
      category: existing.category,
      locationId: existing.locationId,
      employeeUserId: existing.employeeUserId,
      glJournalEntryId: glResult?.id ?? null,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'expense.posted', 'expense', expenseId);
  return result;
}
