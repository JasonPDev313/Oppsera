import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { expensePolicies } from '@oppsera/db';
import type { z } from 'zod';
import type { createExpensePolicySchema } from '../validation';

type CreateExpensePolicyInput = z.input<typeof createExpensePolicySchema>;

export async function createExpensePolicy(
  ctx: RequestContext,
  input: CreateExpensePolicyInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // If setting as default, clear existing default first
    if (input.isDefault) {
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

    const [created] = await tx
      .insert(expensePolicies)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        description: input.description ?? null,
        autoApproveThreshold: input.autoApproveThreshold?.toFixed(2) ?? null,
        requiresReceiptAbove: input.requiresReceiptAbove?.toFixed(2) ?? null,
        maxAmountPerExpense: input.maxAmountPerExpense?.toFixed(2) ?? null,
        allowedCategories: input.allowedCategories ?? null,
        approverRole: input.approverRole ?? 'manager',
        isDefault: input.isDefault ?? false,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'expense.policy.created.v1', {
      policyId: created!.id,
      name: input.name,
      isDefault: input.isDefault ?? false,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'expense.policy.created', 'expense_policy', result.id);
  return result;
}
