import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { expenses } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export async function approveExpense(ctx: RequestContext, expenseId: string) {
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
        `Cannot approve expense in '${existing.status}' status`,
        400,
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(expenses)
      .set({
        status: 'approved',
        approvedAt: now,
        approvedBy: ctx.user.id,
        updatedAt: now,
        version: existing.version + 1,
      })
      .where(eq(expenses.id, expenseId))
      .returning();

    const event = buildEventFromContext(ctx, 'expense.approved.v1', {
      expenseId,
      amount: Number(existing.amount),
      approvedBy: ctx.user.id,
      autoApproved: false,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'expense.approved', 'expense', expenseId);
  return result;
}
