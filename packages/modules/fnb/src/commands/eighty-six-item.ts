import { eq, and, isNull } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbEightySixLog } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { EightySixItemInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { ItemAlreadyEightySixedError } from '../errors';

export async function eightySixItem(
  ctx: RequestContext,
  input: EightySixItemInput,
) {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to 86 an item');
  }
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'eightySixItem',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Check if already 86'd (active, not restored)
    const existing = await (tx as any)
      .select()
      .from(fnbEightySixLog)
      .where(and(
        eq(fnbEightySixLog.tenantId, ctx.tenantId),
        eq(fnbEightySixLog.locationId, ctx.locationId!),
        eq(fnbEightySixLog.entityType, input.entityType ?? 'item'),
        eq(fnbEightySixLog.entityId, input.entityId),
        isNull(fnbEightySixLog.restoredAt),
      ))
      .limit(1);
    if (existing.length > 0) throw new ItemAlreadyEightySixedError(input.entityId);

    const [created] = await (tx as any)
      .insert(fnbEightySixLog)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        entityType: input.entityType ?? 'item',
        entityId: input.entityId,
        stationId: input.stationId ?? null,
        reason: input.reason ?? null,
        eightySixedBy: ctx.user.id,
        autoRestoreAtDayEnd: input.autoRestoreAtDayEnd ?? true,
        businessDate: input.businessDate,
      })
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.ITEM_EIGHTY_SIXED, {
      eightySixLogId: created!.id,
      locationId: ctx.locationId,
      entityType: input.entityType ?? 'item',
      entityId: input.entityId,
      stationId: input.stationId ?? null,
      reason: input.reason ?? null,
      businessDate: input.businessDate,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'eightySixItem', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'fnb.86.item_eighty_sixed', 'fnb_eighty_six_log', result.id);
  return result;
}
