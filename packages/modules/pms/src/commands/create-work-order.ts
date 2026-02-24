/**
 * Create a maintenance work order.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsWorkOrders, pmsProperties } from '@oppsera/db';
import type { CreateWorkOrderInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createWorkOrder(ctx: RequestContext, input: CreateWorkOrderInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, input.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', input.propertyId);

    const id = generateUlid();
    await tx.insert(pmsWorkOrders).values({
      id,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      roomId: input.roomId ?? null,
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? 'general',
      priority: input.priority ?? 'medium',
      assignedTo: input.assignedTo ?? null,
      reportedBy: ctx.user.id,
      estimatedHours: input.estimatedHours != null ? String(input.estimatedHours) : null,
      dueDate: input.dueDate ?? null,
    });

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'work_order', id, 'created', {
      title: input.title,
      category: input.category ?? 'general',
      priority: input.priority ?? 'medium',
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.WORK_ORDER_CREATED, {
      workOrderId: id,
      propertyId: input.propertyId,
      roomId: input.roomId ?? null,
      title: input.title,
      category: input.category ?? 'general',
      priority: input.priority ?? 'medium',
      reportedBy: ctx.user.id,
    });

    return { result: { id }, events: [event] };
  });

  await auditLog(ctx, 'pms.work_order.created', 'pms_work_order', result.id);
  return result;
}
