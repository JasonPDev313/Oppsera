import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbMenuAvailabilityWindows } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateAvailabilityWindowInput } from '../validation';

export async function createAvailabilityWindow(
  ctx: RequestContext,
  input: CreateAvailabilityWindowInput,
) {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to create an availability window');
  }
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createAvailabilityWindow',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [created] = await (tx as any)
      .insert(fnbMenuAvailabilityWindows)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        entityType: input.entityType,
        entityId: input.entityId,
        menuPeriodId: input.menuPeriodId ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        hideWhenUnavailable: input.hideWhenUnavailable ?? false,
      })
      .returning();

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createAvailabilityWindow', created);

    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'fnb.availability_window.created', 'fnb_menu_availability_windows', result.id);
  return result;
}
