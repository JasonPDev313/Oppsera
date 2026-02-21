import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbMenuPeriods } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateMenuPeriodInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { MenuPeriodNotFoundError } from '../errors';

export async function updateMenuPeriod(
  ctx: RequestContext,
  periodId: string,
  input: UpdateMenuPeriodInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'updateMenuPeriod',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [period] = await (tx as any)
      .select()
      .from(fnbMenuPeriods)
      .where(and(
        eq(fnbMenuPeriods.id, periodId),
        eq(fnbMenuPeriods.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!period) throw new MenuPeriodNotFoundError(periodId);

    const setFields: Record<string, unknown> = { updatedAt: new Date() };
    const changes: Record<string, unknown> = {};

    if (input.name !== undefined) { setFields.name = input.name; changes.name = input.name; }
    if (input.startTime !== undefined) { setFields.startTime = input.startTime; changes.startTime = input.startTime; }
    if (input.endTime !== undefined) { setFields.endTime = input.endTime; changes.endTime = input.endTime; }
    if (input.daysOfWeek !== undefined) { setFields.daysOfWeek = input.daysOfWeek; changes.daysOfWeek = input.daysOfWeek; }
    if (input.sortOrder !== undefined) { setFields.sortOrder = input.sortOrder; changes.sortOrder = input.sortOrder; }
    if (input.isActive !== undefined) { setFields.isActive = input.isActive; changes.isActive = input.isActive; }

    const [updated] = await (tx as any)
      .update(fnbMenuPeriods)
      .set(setFields)
      .where(eq(fnbMenuPeriods.id, periodId))
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.MENU_PERIOD_UPDATED, {
      menuPeriodId: periodId,
      locationId: ctx.locationId,
      changes,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateMenuPeriod', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.menu_period.updated', 'fnb_menu_periods', periodId);
  return result;
}
