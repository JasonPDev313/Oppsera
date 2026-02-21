import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { fnbShiftExtensions } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateShiftStatusInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

const VALID_TRANSITIONS: Record<string, string[]> = {
  serving: ['cut', 'closing'],
  cut: ['closing'],
  closing: ['checked_out'],
};

export async function updateShiftStatus(
  ctx: RequestContext,
  shiftExtensionId: string,
  input: UpdateShiftStatusInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any)
      .select()
      .from(fnbShiftExtensions)
      .where(and(
        eq(fnbShiftExtensions.id, shiftExtensionId),
        eq(fnbShiftExtensions.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('ShiftExtension', shiftExtensionId);

    const oldStatus = existing.shiftStatus;
    const newStatus = input.shiftStatus;

    // Validate state transition
    const allowed = VALID_TRANSITIONS[oldStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new AppError(
        'INVALID_SHIFT_TRANSITION',
        `Cannot transition shift from '${oldStatus}' to '${newStatus}'`,
        409,
      );
    }

    const updates: Record<string, unknown> = {
      shiftStatus: newStatus,
      updatedAt: new Date(),
    };

    if (newStatus === 'checked_out') {
      updates.checkoutCompletedAt = new Date();
      updates.checkoutCompletedBy = ctx.user.id;
    }

    const [updated] = await (tx as any)
      .update(fnbShiftExtensions)
      .set(updates)
      .where(eq(fnbShiftExtensions.id, shiftExtensionId))
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.SHIFT_STATUS_CHANGED, {
      shiftExtensionId,
      serverUserId: existing.serverUserId,
      locationId: existing.locationId,
      oldStatus,
      newStatus,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.shift.status_changed', 'fnb_shift_extensions', shiftExtensionId);
  return result;
}
