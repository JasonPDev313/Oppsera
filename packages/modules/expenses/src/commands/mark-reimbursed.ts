import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { buildEventFromContext } from '@oppsera/core/events';
import { expenses } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { z } from 'zod';
import type { markReimbursedSchema } from '../validation';

type MarkReimbursedInput = z.input<typeof markReimbursedSchema>;

export async function markReimbursed(ctx: RequestContext, input: MarkReimbursedInput) {
  const { expenseId, method, reference } = input;

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
        `Cannot mark expense as reimbursed in '${existing.status}' status`,
        400,
      );
    }

    if (!existing.isReimbursable) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Expense is not marked as reimbursable',
        400,
      );
    }

    if (existing.reimbursedAt) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Expense has already been reimbursed',
        400,
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(expenses)
      .set({
        reimbursedAt: now,
        reimbursementMethod: method,
        reimbursementReference: reference ?? null,
        updatedAt: now,
        version: existing.version + 1,
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, ctx.tenantId)))
      .returning();

    const event = buildEventFromContext(ctx, 'expense.reimbursed.v1', {
      expenseId,
      amount: Number(existing.amount),
      category: existing.category,
      locationId: existing.locationId,
      method,
      reference: reference ?? null,
      employeeUserId: existing.employeeUserId,
    });

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'expense.reimbursed', 'expense', expenseId);
  return result;
}
