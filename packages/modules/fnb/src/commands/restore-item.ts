import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbEightySixLog } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { RestoreItemInput } from '../validation';
import { FNB_EVENTS } from '../events/types';
import { EightySixLogNotFoundError } from '../errors';

export async function restoreItem(
  ctx: RequestContext,
  input: RestoreItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'restoreItem',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [logEntry] = await (tx as any)
      .select()
      .from(fnbEightySixLog)
      .where(and(
        eq(fnbEightySixLog.id, input.eightySixLogId),
        eq(fnbEightySixLog.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!logEntry) throw new EightySixLogNotFoundError(input.eightySixLogId);

    const [updated] = await (tx as any)
      .update(fnbEightySixLog)
      .set({
        restoredAt: new Date(),
        restoredBy: ctx.user.id,
      })
      .where(eq(fnbEightySixLog.id, input.eightySixLogId))
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.ITEM_RESTORED, {
      eightySixLogId: input.eightySixLogId,
      locationId: logEntry.locationId,
      entityType: logEntry.entityType,
      entityId: logEntry.entityId,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'restoreItem', updated);

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.86.item_restored', 'fnb_eighty_six_log', input.eightySixLogId);
  return result;
}
