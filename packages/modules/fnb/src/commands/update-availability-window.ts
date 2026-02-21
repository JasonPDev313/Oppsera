import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbMenuAvailabilityWindows } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateAvailabilityWindowInput } from '../validation';
import { AvailabilityWindowNotFoundError } from '../errors';

export async function updateAvailabilityWindow(
  ctx: RequestContext,
  windowId: string,
  input: UpdateAvailabilityWindowInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'updateAvailabilityWindow',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [existing] = await (tx as any)
      .select()
      .from(fnbMenuAvailabilityWindows)
      .where(and(
        eq(fnbMenuAvailabilityWindows.id, windowId),
        eq(fnbMenuAvailabilityWindows.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!existing) throw new AvailabilityWindowNotFoundError(windowId);

    const setFields: Record<string, unknown> = { updatedAt: new Date() };

    if (input.menuPeriodId !== undefined) setFields.menuPeriodId = input.menuPeriodId;
    if (input.startDate !== undefined) setFields.startDate = input.startDate;
    if (input.endDate !== undefined) setFields.endDate = input.endDate;
    if (input.hideWhenUnavailable !== undefined) setFields.hideWhenUnavailable = input.hideWhenUnavailable;
    if (input.isActive !== undefined) setFields.isActive = input.isActive;

    const [updated] = await (tx as any)
      .update(fnbMenuAvailabilityWindows)
      .set(setFields)
      .where(eq(fnbMenuAvailabilityWindows.id, windowId))
      .returning();

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateAvailabilityWindow', updated);

    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'fnb.availability_window.updated', 'fnb_menu_availability_windows', windowId);
  return result;
}
