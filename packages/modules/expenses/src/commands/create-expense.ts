import type { RequestContext } from '@oppsera/core/auth';
import { publishWithOutbox } from '@oppsera/core/events';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers';
import { auditLog } from '@oppsera/core/audit';
import { buildEventFromContext } from '@oppsera/core/events';
import { expenses } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { z } from 'zod';
import type { createExpenseSchema } from '../validation';

type CreateExpenseInput = z.input<typeof createExpenseSchema>;

export async function createExpense(ctx: RequestContext, input: CreateExpenseInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(
        tx,
        ctx.tenantId,
        input.clientRequestId,
        'createExpense',
      );
      if (idempotencyCheck.isDuplicate) {
        return { result: idempotencyCheck.originalResult as any, events: [] };
      }
    }

    // Generate expense number: EXP-YYYYMMDD-XXXXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = generateUlid().slice(-6).toUpperCase();
    const expenseNumber = `EXP-${dateStr}-${suffix}`;

    const [created] = await tx
      .insert(expenses)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.locationId ?? ctx.locationId ?? null,
        expenseNumber,
        employeeUserId: ctx.user.id,
        expensePolicyId: input.expensePolicyId ?? null,
        expenseDate: input.expenseDate,
        vendorName: input.vendorName ?? null,
        category: input.category,
        description: input.description ?? null,
        amount: input.amount.toFixed(2),
        currency: input.currency ?? 'USD',
        paymentMethod: input.paymentMethod ?? null,
        isReimbursable: input.isReimbursable ?? true,
        glAccountId: input.glAccountId ?? null,
        projectId: input.projectId ?? null,
        notes: input.notes ?? null,
        metadata: input.metadata ?? {},
        clientRequestId: input.clientRequestId ?? null,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'expense.created.v1', {
      expenseId: created!.id,
      expenseNumber,
      amount: input.amount,
      category: input.category,
      employeeUserId: ctx.user.id,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(
        tx,
        ctx.tenantId,
        input.clientRequestId,
        'createExpense',
        created!,
      );
    }

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'expense.created', 'expense', result.id);
  return result;
}
