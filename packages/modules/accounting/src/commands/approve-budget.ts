import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { budgets } from '@oppsera/db';
import { ACCOUNTING_EVENTS } from '../events/types';

export async function approveBudget(ctx: RequestContext, budgetId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, budgetId), eq(budgets.tenantId, ctx.tenantId)))
      .limit(1);

    if (!existing) {
      throw new Error('Budget not found');
    }

    if (existing.status !== 'draft') {
      throw new Error(`Cannot approve a budget with status "${existing.status}"`);
    }

    const [updated] = await tx
      .update(budgets)
      .set({
        status: 'approved',
        approvedBy: ctx.user.id,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(budgets.id, budgetId), eq(budgets.tenantId, ctx.tenantId)))
      .returning();

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.BUDGET_APPROVED, {
      budgetId,
    });

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'accounting.budget.approved', 'budget', result.id);
  return result;
}
