import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { expenses } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { z } from 'zod';
import type { updateExpenseSchema } from '../validation';

type UpdateExpenseInput = z.input<typeof updateExpenseSchema>;

export async function updateExpense(
  ctx: RequestContext,
  expenseId: string,
  input: UpdateExpenseInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.tenantId, ctx.tenantId), eq(expenses.id, expenseId)));

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Expense not found', 404);
    }

    // Only draft or rejected expenses can be edited
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot edit expense in '${existing.status}' status`,
        400,
      );
    }

    // Optimistic locking
    if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
      throw new AppError('CONFLICT', 'Expense has been modified by another user', 409);
    }

    const setValues: Record<string, unknown> = {
      updatedAt: new Date(),
      version: existing.version + 1,
    };

    if (input.expenseDate !== undefined) setValues.expenseDate = input.expenseDate;
    if (input.vendorName !== undefined) setValues.vendorName = input.vendorName;
    if (input.category !== undefined) setValues.category = input.category;
    if (input.description !== undefined) setValues.description = input.description;
    if (input.amount !== undefined) setValues.amount = input.amount.toFixed(2);
    if (input.paymentMethod !== undefined) setValues.paymentMethod = input.paymentMethod;
    if (input.isReimbursable !== undefined) setValues.isReimbursable = input.isReimbursable;
    if (input.glAccountId !== undefined) setValues.glAccountId = input.glAccountId;
    if (input.projectId !== undefined) setValues.projectId = input.projectId;
    if (input.expensePolicyId !== undefined) setValues.expensePolicyId = input.expensePolicyId;
    if (input.notes !== undefined) setValues.notes = input.notes;
    if (input.metadata !== undefined) setValues.metadata = input.metadata;

    // If resubmitting a rejected expense, reset status to draft
    if (existing.status === 'rejected') {
      setValues.status = 'draft';
      setValues.rejectedAt = null;
      setValues.rejectedBy = null;
      setValues.rejectionReason = null;
    }

    const [updated] = await tx
      .update(expenses)
      .set(setValues)
      .where(eq(expenses.id, expenseId))
      .returning();

    const event = buildEventFromContext(ctx, 'expense.updated.v1', {
      expenseId,
      changes: Object.keys(setValues).filter((k) => k !== 'updatedAt' && k !== 'version'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'expense.updated', 'expense', expenseId);
  return result;
}
