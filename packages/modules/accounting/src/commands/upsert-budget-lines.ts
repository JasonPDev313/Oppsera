import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { budgets, budgetLines } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { ACCOUNTING_EVENTS } from '../events/types';

export interface BudgetLineInput {
  glAccountId: string;
  month1?: number;
  month2?: number;
  month3?: number;
  month4?: number;
  month5?: number;
  month6?: number;
  month7?: number;
  month8?: number;
  month9?: number;
  month10?: number;
  month11?: number;
  month12?: number;
  notes?: string;
}

export async function upsertBudgetLines(
  ctx: RequestContext,
  budgetId: string,
  lines: BudgetLineInput[],
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [budget] = await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, budgetId), eq(budgets.tenantId, ctx.tenantId)))
      .limit(1);

    if (!budget) {
      throw new Error('Budget not found');
    }

    if (budget.status === 'locked') {
      throw new Error('Cannot modify lines in a locked budget');
    }

    const upserted: Array<typeof budgetLines.$inferSelect> = [];

    for (const line of lines) {
      const monthValues = {
        month1: String(line.month1 ?? 0),
        month2: String(line.month2 ?? 0),
        month3: String(line.month3 ?? 0),
        month4: String(line.month4 ?? 0),
        month5: String(line.month5 ?? 0),
        month6: String(line.month6 ?? 0),
        month7: String(line.month7 ?? 0),
        month8: String(line.month8 ?? 0),
        month9: String(line.month9 ?? 0),
        month10: String(line.month10 ?? 0),
        month11: String(line.month11 ?? 0),
        month12: String(line.month12 ?? 0),
        notes: line.notes ?? null,
        updatedAt: new Date(),
      };

      const [row] = await tx
        .insert(budgetLines)
        .values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          budgetId,
          glAccountId: line.glAccountId,
          ...monthValues,
        })
        .onConflictDoUpdate({
          target: [budgetLines.budgetId, budgetLines.glAccountId],
          set: monthValues,
        })
        .returning();

      upserted.push(row!);
    }

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.BUDGET_LINES_UPDATED, {
      budgetId,
      lineCount: lines.length,
    });

    return { result: upserted, events: [event] };
  });

  await auditLog(ctx, 'accounting.budget.lines_updated', 'budget', budgetId);
  return result;
}
