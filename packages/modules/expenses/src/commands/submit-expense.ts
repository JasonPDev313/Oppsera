import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { expenses, expensePolicies } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export async function submitExpense(ctx: RequestContext, expenseId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.tenantId, ctx.tenantId), eq(expenses.id, expenseId)));

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Expense not found', 404);
    }

    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot submit expense in '${existing.status}' status`,
        400,
      );
    }

    // Check policy constraints
    let autoApprove = false;
    if (existing.expensePolicyId) {
      const [policy] = await tx
        .select()
        .from(expensePolicies)
        .where(
          and(
            eq(expensePolicies.tenantId, ctx.tenantId),
            eq(expensePolicies.id, existing.expensePolicyId),
          ),
        );

      if (policy) {
        const amount = Number(existing.amount);

        // Check max amount
        if (policy.maxAmountPerExpense && amount > Number(policy.maxAmountPerExpense)) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Expense amount $${amount.toFixed(2)} exceeds policy maximum of $${Number(policy.maxAmountPerExpense).toFixed(2)}`,
            400,
          );
        }

        // Check allowed categories
        if (policy.allowedCategories && policy.allowedCategories.length > 0) {
          if (!policy.allowedCategories.includes(existing.category)) {
            throw new AppError(
              'VALIDATION_ERROR',
              `Category '${existing.category}' is not allowed by expense policy`,
              400,
            );
          }
        }

        // Check receipt requirement
        if (
          policy.requiresReceiptAbove &&
          amount > Number(policy.requiresReceiptAbove) &&
          !existing.receiptUrl
        ) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Receipt required for expenses above $${Number(policy.requiresReceiptAbove).toFixed(2)}`,
            400,
          );
        }

        // Check auto-approve threshold
        if (policy.autoApproveThreshold && amount <= Number(policy.autoApproveThreshold)) {
          autoApprove = true;
        }
      }
    }

    const now = new Date();
    const setValues: Record<string, unknown> = {
      submittedAt: now,
      submittedBy: ctx.user.id,
      updatedAt: now,
      version: existing.version + 1,
    };

    const events = [];

    if (autoApprove) {
      setValues.status = 'approved';
      setValues.approvedAt = now;
      setValues.approvedBy = 'system';

      events.push(
        buildEventFromContext(ctx, 'expense.submitted.v1', {
          expenseId,
          amount: Number(existing.amount),
          autoApproved: true,
        }),
      );
      events.push(
        buildEventFromContext(ctx, 'expense.approved.v1', {
          expenseId,
          amount: Number(existing.amount),
          approvedBy: 'system',
          autoApproved: true,
        }),
      );
    } else {
      setValues.status = 'submitted';

      events.push(
        buildEventFromContext(ctx, 'expense.submitted.v1', {
          expenseId,
          amount: Number(existing.amount),
          autoApproved: false,
        }),
      );
    }

    const [updated] = await tx
      .update(expenses)
      .set(setValues)
      .where(eq(expenses.id, expenseId))
      .returning();

    return { result: updated!, events };
  });

  await auditLog(ctx, 'expense.submitted', 'expense', expenseId);
  return result;
}
