/**
 * Complete a work order.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, AppError } from '@oppsera/shared';
import { pmsWorkOrders } from '@oppsera/db';
import type { CompleteWorkOrderInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function completeWorkOrder(
  ctx: RequestContext,
  workOrderId: string,
  input: CompleteWorkOrderInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsWorkOrders)
      .where(and(eq(pmsWorkOrders.id, workOrderId), eq(pmsWorkOrders.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('WorkOrder', workOrderId);

    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw new AppError('INVALID_STATUS', `Work order is already ${existing.status}`, 409);
    }

    const now = new Date();
    await tx
      .update(pmsWorkOrders)
      .set({
        status: 'completed',
        completedAt: now,
        resolutionNotes: input.resolutionNotes ?? null,
        actualHours: input.actualHours != null ? String(input.actualHours) : null,
        partsCostCents: input.partsCostCents ?? null,
        updatedAt: now,
      })
      .where(eq(pmsWorkOrders.id, workOrderId));

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'work_order', workOrderId, 'completed', {
      status: { before: existing.status, after: 'completed' },
      actualHours: input.actualHours ?? null,
      partsCostCents: input.partsCostCents ?? null,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.WORK_ORDER_COMPLETED, {
      workOrderId,
      propertyId: existing.propertyId,
      roomId: existing.roomId,
      title: existing.title,
      category: existing.category,
      resolutionNotes: input.resolutionNotes ?? null,
      actualHours: input.actualHours ?? null,
      partsCostCents: input.partsCostCents ?? null,
    });

    return { result: { id: workOrderId, status: 'completed' }, events: [event] };
  });

  await auditLog(ctx, 'pms.work_order.completed', 'pms_work_order', result.id);
  return result;
}
