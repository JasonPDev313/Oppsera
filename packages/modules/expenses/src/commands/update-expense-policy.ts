import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { expensePolicies } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import type { z } from 'zod';
import type { updateExpensePolicySchema } from '../validation';

type UpdateExpensePolicyInput = z.input<typeof updateExpensePolicySchema>;

export async function updateExpensePolicy(
  ctx: RequestContext,
  policyId: string,
  input: UpdateExpensePolicyInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(expensePolicies)
      .where(
        and(eq(expensePolicies.tenantId, ctx.tenantId), eq(expensePolicies.id, policyId)),
      );

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Expense policy not found', 404);
    }

    // If setting as default, clear existing default first
    if (input.isDefault === true && !existing.isDefault) {
      await tx
        .update(expensePolicies)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(expensePolicies.tenantId, ctx.tenantId),
            eq(expensePolicies.isDefault, true),
          ),
        );
    }

    const setValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) setValues.name = input.name;
    if (input.description !== undefined) setValues.description = input.description;
    if (input.autoApproveThreshold !== undefined) {
      setValues.autoApproveThreshold = input.autoApproveThreshold?.toFixed(2) ?? null;
    }
    if (input.requiresReceiptAbove !== undefined) {
      setValues.requiresReceiptAbove = input.requiresReceiptAbove?.toFixed(2) ?? null;
    }
    if (input.maxAmountPerExpense !== undefined) {
      setValues.maxAmountPerExpense = input.maxAmountPerExpense?.toFixed(2) ?? null;
    }
    if (input.allowedCategories !== undefined) setValues.allowedCategories = input.allowedCategories;
    if (input.approverRole !== undefined) setValues.approverRole = input.approverRole;
    if (input.isDefault !== undefined) setValues.isDefault = input.isDefault;
    if (input.isActive !== undefined) setValues.isActive = input.isActive;

    const [updated] = await tx
      .update(expensePolicies)
      .set(setValues)
      .where(eq(expensePolicies.id, policyId))
      .returning();

    const event = buildEventFromContext(ctx, 'expense.policy.updated.v1', {
      policyId,
      changes: Object.keys(setValues).filter((k) => k !== 'updatedAt'),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'expense.policy.updated', 'expense_policy', policyId);
  return result;
}
