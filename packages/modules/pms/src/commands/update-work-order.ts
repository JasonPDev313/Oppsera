/**
 * Update a work order.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsWorkOrders } from '@oppsera/db';
import type { UpdateWorkOrderInput } from '../validation';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateWorkOrder(
  ctx: RequestContext,
  workOrderId: string,
  input: UpdateWorkOrderInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsWorkOrders)
      .where(and(eq(pmsWorkOrders.id, workOrderId), eq(pmsWorkOrders.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('WorkOrder', workOrderId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.category !== undefined) updates.category = input.category;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.status !== undefined) updates.status = input.status;
    if (input.assignedTo !== undefined) updates.assignedTo = input.assignedTo;
    if (input.estimatedHours !== undefined) {
      updates.estimatedHours = input.estimatedHours != null ? String(input.estimatedHours) : null;
    }
    if (input.dueDate !== undefined) updates.dueDate = input.dueDate;

    await tx
      .update(pmsWorkOrders)
      .set(updates)
      .where(eq(pmsWorkOrders.id, workOrderId));

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'work_order', workOrderId, 'updated', updates);

    return { result: { id: workOrderId }, events: [] };
  });

  await auditLog(ctx, 'pms.work_order.updated', 'pms_work_order', result.id);
  return result;
}
