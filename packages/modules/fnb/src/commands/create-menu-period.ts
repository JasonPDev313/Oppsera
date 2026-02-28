import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbMenuPeriods } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateMenuPeriodInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { DuplicateMenuPeriodNameError } from '../errors';

export async function createMenuPeriod(
  ctx: RequestContext,
  input: CreateMenuPeriodInput,
) {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to create a menu period');
  }
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createMenuPeriod',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Check for duplicate name
    const [existing] = await (tx as any)
      .select()
      .from(fnbMenuPeriods)
      .where(and(
        eq(fnbMenuPeriods.tenantId, ctx.tenantId),
        eq(fnbMenuPeriods.locationId, ctx.locationId!),
        eq(fnbMenuPeriods.name, input.name),
      ))
      .limit(1);
    if (existing) throw new DuplicateMenuPeriodNameError(input.name);

    const [created] = await (tx as any)
      .insert(fnbMenuPeriods)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        name: input.name,
        startTime: input.startTime,
        endTime: input.endTime,
        daysOfWeek: input.daysOfWeek,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.MENU_PERIOD_CREATED, {
      menuPeriodId: created!.id,
      locationId: ctx.locationId,
      name: input.name,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createMenuPeriod', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'fnb.menu_period.created', 'fnb_menu_periods', result.id);
  return result;
}
