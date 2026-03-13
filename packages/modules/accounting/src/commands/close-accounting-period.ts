import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { accountingClosePeriods, accountingSettings } from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';
import { ACCOUNTING_EVENTS } from '../events/types';
import { getCloseChecklist } from '../queries/get-close-checklist';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';

interface CloseAccountingPeriodInput {
  postingPeriod: string; // 'YYYY-MM'
  notes?: string;
  /** When true, bypass checklist failures and monotonic lock guard. */
  forceClose?: boolean;
}

export async function closeAccountingPeriod(
  ctx: RequestContext,
  input: CloseAccountingPeriodInput,
) {
  // ── Guard 1: Future period check (matches lockAccountingPeriod) ──
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (input.postingPeriod > currentPeriod) {
    throw new AppError('INVALID_PERIOD', `Cannot close future period ${input.postingPeriod}`, 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // ── Checklist inside transaction to eliminate TOCTOU race ────
    // Previously ran outside the tx — data could change between
    // checklist evaluation and the close operation.
    if (!input.forceClose) {
      const checklist = await getCloseChecklist({
        tenantId: ctx.tenantId,
        postingPeriod: input.postingPeriod,
        tx,
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

    const txNow = new Date();

    if (period) {
      const [updated] = await tx
        .update(accountingClosePeriods)
        .set({
          status: 'closed',
          closedAt: txNow,
          closedBy: ctx.user.id,
          notes: input.notes ?? period.notes,
          updatedAt: txNow,
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
          closedAt: txNow,
          closedBy: ctx.user.id,
          notes: input.notes ?? null,
        })
        .returning();
      period = created!;
    }

    // ── Guard 2: Monotonic lock advancement (matches lockAccountingPeriod) ──
    // Ensure a settings row exists so the lock UPDATE always has a target row.
    // Without this, tenants who never bootstrapped accounting would "close"
    // the period without actually creating a posting lock.
    await ensureAccountingSettings(tx, ctx.tenantId);

    // Read current lockPeriodThrough and reject if we'd move it backward.
    const [settings] = await tx
      .select({ lockPeriodThrough: accountingSettings.lockPeriodThrough })
      .from(accountingSettings)
      .where(eq(accountingSettings.tenantId, ctx.tenantId))
      .limit(1);

    if (settings?.lockPeriodThrough && input.postingPeriod <= settings.lockPeriodThrough && !input.forceClose) {
      throw new AppError(
        'PERIOD_ALREADY_LOCKED',
        `Period ${input.postingPeriod} is already locked (locked through ${settings.lockPeriodThrough}). Use forceClose to override.`,
        409,
      );
    }

    // Only advance the lock (or set it for the first time).
    // settings is guaranteed non-null after ensureAccountingSettings.
    if (!settings?.lockPeriodThrough || input.postingPeriod > settings.lockPeriodThrough) {
      await tx
        .update(accountingSettings)
        .set({
          lockPeriodThrough: input.postingPeriod,
          updatedAt: txNow,
        })
        .where(eq(accountingSettings.tenantId, ctx.tenantId));
    }

    // 3. Emit period locked event
    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.PERIOD_LOCKED, {
      period: input.postingPeriod,
    });

    return { result: period!, events: [event] };
  });

  auditLogDeferred(ctx, 'accounting.period.closed', 'accounting_close_period', result.id);
  return result;
}
