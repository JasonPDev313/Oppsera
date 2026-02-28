import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { budgets } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { ACCOUNTING_EVENTS } from '../events/types';

export interface CreateBudgetInput {
  name: string;
  fiscalYear: number;
  description?: string;
  locationId?: string;
}

export async function createBudget(ctx: RequestContext, input: CreateBudgetInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          eq(budgets.tenantId, ctx.tenantId),
          eq(budgets.name, input.name),
          eq(budgets.fiscalYear, input.fiscalYear),
        ),
      )
      .limit(1);

    if (existing) {
      throw new Error(`Budget "${input.name}" for fiscal year ${input.fiscalYear} already exists`);
    }

    const id = generateUlid();
    const [created] = await tx
      .insert(budgets)
      .values({
        id,
        tenantId: ctx.tenantId,
        name: input.name,
        fiscalYear: input.fiscalYear,
        status: 'draft',
        description: input.description ?? null,
        locationId: input.locationId ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.BUDGET_CREATED, {
      budgetId: id,
      name: input.name,
      fiscalYear: input.fiscalYear,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'accounting.budget.created', 'budget', result.id);
  return result;
}
