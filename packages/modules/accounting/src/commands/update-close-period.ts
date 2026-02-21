import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { accountingClosePeriods } from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';

interface UpdateClosePeriodInput {
  postingPeriod: string; // 'YYYY-MM'
  status?: 'open' | 'in_review' | 'closed';
  checklist?: Record<string, unknown>;
  notes?: string;
}

export async function updateClosePeriod(
  ctx: RequestContext,
  input: UpdateClosePeriodInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find or create the close period row
    const [existing] = await tx
      .select()
      .from(accountingClosePeriods)
      .where(
        and(
          eq(accountingClosePeriods.tenantId, ctx.tenantId),
          eq(accountingClosePeriods.postingPeriod, input.postingPeriod),
        ),
      )
      .limit(1);

    if (existing && existing.status === 'closed') {
      throw new AppError('PERIOD_CLOSED', `Period ${input.postingPeriod} is already closed`, 409);
    }

    if (existing) {
      const updateSet: Record<string, unknown> = { updatedAt: new Date() };
      if (input.status !== undefined) updateSet.status = input.status;
      if (input.checklist !== undefined) updateSet.checklist = input.checklist;
      if (input.notes !== undefined) updateSet.notes = input.notes;

      const [updated] = await tx
        .update(accountingClosePeriods)
        .set(updateSet)
        .where(eq(accountingClosePeriods.id, existing.id))
        .returning();

      return { result: updated!, events: [] };
    }

    // Create new
    const [created] = await tx
      .insert(accountingClosePeriods)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        postingPeriod: input.postingPeriod,
        status: input.status ?? 'open',
        checklist: input.checklist ?? {},
        notes: input.notes ?? null,
      })
      .returning();

    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'accounting.close_period.updated', 'accounting_close_period', result.id);
  return result;
}
