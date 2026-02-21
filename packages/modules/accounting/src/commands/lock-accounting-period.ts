import { eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { accountingSettings } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import { ACCOUNTING_EVENTS } from '../events/types';

export async function lockAccountingPeriod(
  ctx: RequestContext,
  period: string,
) {
  // Validate period is not in the future
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (period > currentPeriod) {
    throw new AppError('INVALID_PERIOD', `Cannot lock future period ${period}`, 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load or create settings
    const [existing] = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.tenantId, ctx.tenantId))
      .limit(1);

    let settings;
    if (existing) {
      // Only advance the lock (never move it backward)
      if (existing.lockPeriodThrough && period <= existing.lockPeriodThrough) {
        throw new AppError(
          'PERIOD_ALREADY_LOCKED',
          `Period ${period} is already locked (locked through ${existing.lockPeriodThrough})`,
          409,
        );
      }

      [settings] = await tx
        .update(accountingSettings)
        .set({ lockPeriodThrough: period, updatedAt: new Date() })
        .where(eq(accountingSettings.tenantId, ctx.tenantId))
        .returning();
    } else {
      [settings] = await tx
        .insert(accountingSettings)
        .values({ tenantId: ctx.tenantId, lockPeriodThrough: period })
        .returning();
    }

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.PERIOD_LOCKED, {
      period,
    });

    return { result: settings!, events: [event] };
  });

  await auditLog(ctx, 'accounting.period.locked', 'accounting_settings', ctx.tenantId, {
    period: { old: null, new: period },
  });
  return result;
}
