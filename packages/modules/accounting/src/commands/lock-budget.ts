import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { budgets } from '@oppsera/db';
import { ACCOUNTING_EVENTS } from '../events/types';

export async function lockBudget(ctx: RequestContext, budgetId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, budgetId), eq(budgets.tenantId, ctx.tenantId)))
      .limit(1);

    if (!existing) {
      throw new Error('Budget not found');
    }

    if (existing.status !== 'approved') {
      throw new Error(`Cannot lock a budget with status "${existing.status}" — must be approved first`);
    }

    const [updated] = await tx
      .update(budgets)
      .set({ status: 'locked', updatedAt: new Date() })
      .where(and(eq(budgets.id, budgetId), eq(budgets.tenantId, ctx.tenantId)))
      .returning();

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.BUDGET_LOCKED, {
      budgetId,
    });

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'accounting.budget.locked', 'budget', result.id);
  return result;
}
