import { eq, and, ne } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { budgets } from '@oppsera/db';
import { ACCOUNTING_EVENTS } from '../events/types';

export interface UpdateBudgetInput {
  budgetId: string;
  name?: string;
  description?: string;
  locationId?: string | null;
}

export async function updateBudget(ctx: RequestContext, input: UpdateBudgetInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, input.budgetId), eq(budgets.tenantId, ctx.tenantId)))
      .limit(1);

    if (!existing) {
      throw new Error('Budget not found');
    }

    if (existing.status === 'locked') {
      throw new Error('Cannot update a locked budget');
    }

    if (input.name && input.name !== existing.name) {
      const [dup] = await tx
        .select({ id: budgets.id })
        .from(budgets)
        .where(
          and(
            eq(budgets.tenantId, ctx.tenantId),
            eq(budgets.name, input.name),
            eq(budgets.fiscalYear, existing.fiscalYear),
            ne(budgets.id, input.budgetId),
          ),
        )
        .limit(1);

      if (dup) {
        throw new Error(`Budget "${input.name}" for fiscal year ${existing.fiscalYear} already exists`);
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.locationId !== undefined) updates.locationId = input.locationId;

    const [updated] = await tx
      .update(budgets)
      .set(updates)
      .where(eq(budgets.id, input.budgetId))
      .returning();

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.BUDGET_UPDATED, {
      budgetId: input.budgetId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'accounting.budget.updated', 'budget', result.id);
  return result;
}
