import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbShiftExtensions } from '@oppsera/db';
import { ConflictError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateShiftExtensionInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

export async function createShiftExtension(
  ctx: RequestContext,
  input: CreateShiftExtensionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createShiftExtension',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Check for existing shift extension for this time entry
    const [existing] = await (tx as any)
      .select()
      .from(fnbShiftExtensions)
      .where(and(
        eq(fnbShiftExtensions.tenantId, ctx.tenantId),
        eq(fnbShiftExtensions.employeeTimeEntryId, input.employeeTimeEntryId),
      ))
      .limit(1);
    if (existing) throw new ConflictError('Shift extension already exists for this time entry');

    const [created] = await (tx as any)
      .insert(fnbShiftExtensions)
      .values({
        tenantId: ctx.tenantId,
        employeeTimeEntryId: input.employeeTimeEntryId,
        serverUserId: input.serverUserId,
        locationId: ctx.locationId ?? '',
        businessDate: input.businessDate,
        shiftStatus: 'serving',
      })
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.SHIFT_STATUS_CHANGED, {
      shiftExtensionId: created!.id,
      serverUserId: input.serverUserId,
      locationId: ctx.locationId ?? '',
      oldStatus: 'none',
      newStatus: 'serving',
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createShiftExtension', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'fnb.shift.created', 'fnb_shift_extensions', result.id);
  return result;
}
