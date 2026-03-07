import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { accountingClosePeriods, accountingSettings } from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';
import { ACCOUNTING_EVENTS } from '../events/types';
import { getCloseChecklist } from '../queries/get-close-checklist';

interface CloseAccountingPeriodInput {
  postingPeriod: string; // 'YYYY-MM'
  notes?: string;
  /** When true, bypass checklist failures. Requires explicit user acknowledgement. */
  forceClose?: boolean;
}

export async function closeAccountingPeriod(
  ctx: RequestContext,
  input: CloseAccountingPeriodInput,
) {
  // Enforce close checklist — reject if any items are 'fail' (unless forceClose)
  if (!input.forceClose) {
    const checklist = await getCloseChecklist({
      tenantId: ctx.tenantId,
      postingPeriod: input.postingPeriod,
    });
    const failedItems = checklist.items.filter((i) => i.status === 'fail');
    if (failedItems.length > 0) {
      const reasons = failedItems.map((i) => `${i.label}: ${i.detail}`).join('; ');
      throw new AppError(
        'CHECKLIST_FAILED',
        `Cannot close period ${input.postingPeriod}: ${failedItems.length} checklist item(s) failed. ${reasons}`,
        409,
      );
    }
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Find or create the close period row
    let [period] = await tx
      .select()
      .from(accountingClosePeriods)
      .where(
        and(
          eq(accountingClosePeriods.tenantId, ctx.tenantId),
          eq(accountingClosePeriods.postingPeriod, input.postingPeriod),
        ),
      )
      .limit(1);

    if (period && period.status === 'closed') {
      throw new AppError('PERIOD_CLOSED', `Period ${input.postingPeriod} is already closed`, 409);
    }

    const now = new Date();

    if (period) {
      const [updated] = await tx
        .update(accountingClosePeriods)
        .set({
          status: 'closed',
          closedAt: now,
          closedBy: ctx.user.id,
          notes: input.notes ?? period.notes,
          updatedAt: now,
        })
        .where(and(eq(accountingClosePeriods.id, period.id), eq(accountingClosePeriods.tenantId, ctx.tenantId)))
        .returning();
      period = updated!;
    } else {
      const [created] = await tx
        .insert(accountingClosePeriods)
        .values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          postingPeriod: input.postingPeriod,
          status: 'closed',
          checklist: {},
          closedAt: now,
          closedBy: ctx.user.id,
          notes: input.notes ?? null,
        })
        .returning();
      period = created!;
    }

    // 2. Lock the period via accounting_settings.lockPeriodThrough
    await tx
      .update(accountingSettings)
      .set({
        lockPeriodThrough: input.postingPeriod,
      })
      .where(eq(accountingSettings.tenantId, ctx.tenantId));

    // 3. Emit period locked event
    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.PERIOD_LOCKED, {
      period: input.postingPeriod,
    });

    return { result: period!, events: [event] };
  });

  auditLogDeferred(ctx, 'accounting.period.closed', 'accounting_close_period', result.id);
  return result;
}
