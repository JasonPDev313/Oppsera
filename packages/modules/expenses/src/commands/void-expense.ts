import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { getAccountingPostingApi } from '@oppsera/core/helpers';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { expenses } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { z } from 'zod';
import type { voidExpenseSchema } from '../validation';

type VoidExpenseInput = z.input<typeof voidExpenseSchema>;

export async function voidExpense(ctx: RequestContext, input: VoidExpenseInput) {
  const { expenseId, reason } = input;

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.tenantId, ctx.tenantId), eq(expenses.id, expenseId)));

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Expense not found', 404);
    }

    if (existing.status !== 'posted') {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot void expense in '${existing.status}' status`,
        400,
      );
    }

    // Void the GL entry if one exists
    if (existing.glJournalEntryId) {
      try {
        const postingApi = getAccountingPostingApi();
        await postingApi.postEntry(
          {
            ...ctx,
            requestId: `expense-void-${expenseId}`,
          },
          {
            sourceModule: 'expense_management',
            sourceReferenceId: `void-${expenseId}`,
            businessDate: new Date().toISOString().slice(0, 10),
            memo: `VOID: Expense ${existing.expenseNumber} - ${reason}`,
            lines: [],
            forcePost: true,
          },
        );
      } catch (err) {
        // GL void failure should not block expense void — log and continue
        console.error('[expense-gl] Failed to void GL entry for expense', expenseId, err);
      }
    }

    const now = new Date();
    const [updated] = await tx
      .update(expenses)
      .set({
        status: 'voided',
        voidedAt: now,
        voidedBy: ctx.user.id,
        voidReason: reason,
        updatedAt: now,
        version: existing.version + 1,
      })
      .where(eq(expenses.id, expenseId))
      .returning();

    const event = buildEventFromContext(ctx, 'expense.voided.v1', {
      expenseId,
      amount: Number(existing.amount),
      category: existing.category,
      locationId: existing.locationId,
      reason,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'expense.voided', 'expense', expenseId);
  return result;
}
