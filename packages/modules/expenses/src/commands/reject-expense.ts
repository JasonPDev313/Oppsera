import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { expenses } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { z } from 'zod';
import type { rejectExpenseSchema } from '../validation';

type RejectExpenseInput = z.input<typeof rejectExpenseSchema>;

export async function rejectExpense(ctx: RequestContext, input: RejectExpenseInput) {
  const { expenseId, reason } = input;

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.tenantId, ctx.tenantId), eq(expenses.id, expenseId)));

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Expense not found', 404);
    }

    if (existing.status !== 'submitted') {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot reject expense in '${existing.status}' status`,
        400,
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(expenses)
      .set({
        status: 'rejected',
        rejectedAt: now,
        rejectedBy: ctx.user.id,
        rejectionReason: reason,
        updatedAt: now,
        version: existing.version + 1,
      })
      .where(eq(expenses.id, expenseId))
      .returning();

    const event = buildEventFromContext(ctx, 'expense.rejected.v1', {
      expenseId,
      amount: Number(existing.amount),
      rejectedBy: ctx.user.id,
      reason,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'expense.rejected', 'expense', expenseId);
  return result;
}
