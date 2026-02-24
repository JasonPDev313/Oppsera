/**
 * Add a comment to a work order.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsWorkOrders, pmsWorkOrderComments } from '@oppsera/db';
import type { AddWorkOrderCommentInput } from '../validation';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function addWorkOrderComment(
  ctx: RequestContext,
  workOrderId: string,
  input: AddWorkOrderCommentInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [wo] = await tx
      .select()
      .from(pmsWorkOrders)
      .where(and(eq(pmsWorkOrders.id, workOrderId), eq(pmsWorkOrders.tenantId, ctx.tenantId)))
      .limit(1);
    if (!wo) throw new NotFoundError('WorkOrder', workOrderId);

    const id = generateUlid();
    await tx.insert(pmsWorkOrderComments).values({
      id,
      tenantId: ctx.tenantId,
      workOrderId,
      comment: input.comment,
      createdBy: ctx.user.id,
    });

    await pmsAuditLogEntry(tx, ctx, wo.propertyId, 'work_order_comment', id, 'created', {
      workOrderId,
    });

    return { result: { id }, events: [] };
  });

  await auditLog(ctx, 'pms.work_order_comment.created', 'pms_work_order_comment', result.id);
  return result;
}
