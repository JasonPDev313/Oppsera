import { eq, and, sql } from 'drizzle-orm';
import { AppError, generateUlid } from '@oppsera/shared';
import { orderLines, orders } from '@oppsera/db';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '../../helpers/idempotency';
import type { RequestContext } from '../../auth/context';
import type { VoidOrderLineInput } from '../validation';
import type { VoidLineResult } from '../types';

/**
 * Void a single order line.
 * Sets line qty to 0 and recalculates order totals.
 * The line remains in the order for audit trail (not deleted).
 * If wasteTracking is true, indicates the item was already sent to kitchen.
 */
export async function voidOrderLine(
  ctx: RequestContext,
  input: VoidOrderLineInput,
): Promise<VoidLineResult> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'voidOrderLine');
      if (check.isDuplicate) {
        return { result: check.originalResult as VoidLineResult, events: [] };
      }
    }

    // Fetch the order line
    const lineRows = await tx
      .select()
      .from(orderLines)
      .where(
        and(
          eq(orderLines.id, input.orderLineId),
          eq(orderLines.orderId, input.orderId),
          eq(orderLines.tenantId, ctx.tenantId),
        ),
      );

    if (lineRows.length === 0) {
      throw new AppError('LINE_NOT_FOUND', 'Order line not found', 404);
    }

    const line = lineRows[0]!;
    const voidedAmountCents = line.lineTotal;

    // Verify order is in a voidable state
    const orderRows = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, input.orderId),
          eq(orders.tenantId, ctx.tenantId),
        ),
      );

    if (orderRows.length === 0) {
      throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
    }

    const order = orderRows[0]!;
    if (order.status === 'voided') {
      throw new AppError('ORDER_VOIDED', 'Cannot void a line on a voided order', 409);
    }

    // Zero out the line (keep the record for audit)
    await tx
      .update(orderLines)
      .set({
        qty: '0',
        lineSubtotal: 0,
        lineTax: 0,
        lineTotal: 0,
        notes: `[VOIDED] ${input.reason}${input.wasteTracking ? ' [WASTE]' : ''}${line.notes ? ` | ${line.notes}` : ''}`,
      })
      .where(
        and(
          eq(orderLines.id, input.orderLineId),
          eq(orderLines.tenantId, ctx.tenantId),
        ),
      );

    // Recalculate order totals from remaining lines
    await tx.execute(sql`
      UPDATE orders SET
        subtotal = COALESCE((
          SELECT SUM(line_subtotal) FROM order_lines
          WHERE order_id = ${input.orderId} AND tenant_id = ${ctx.tenantId}
        ), 0),
        tax_total = COALESCE((
          SELECT SUM(line_tax) FROM order_lines
          WHERE order_id = ${input.orderId} AND tenant_id = ${ctx.tenantId}
        ), 0),
        total = COALESCE((
          SELECT SUM(line_subtotal) FROM order_lines
          WHERE order_id = ${input.orderId} AND tenant_id = ${ctx.tenantId}
        ), 0)
          + COALESCE((
            SELECT SUM(line_tax) FROM order_lines
            WHERE order_id = ${input.orderId} AND tenant_id = ${ctx.tenantId}
          ), 0)
          + COALESCE(service_charge_total, 0)
          - COALESCE(discount_total, 0),
        updated_at = NOW()
      WHERE id = ${input.orderId} AND tenant_id = ${ctx.tenantId}
    `);

    // Fetch updated order total
    const [updatedOrder] = await tx
      .select({ total: orders.total })
      .from(orders)
      .where(
        and(
          eq(orders.id, input.orderId),
          eq(orders.tenantId, ctx.tenantId),
        ),
      );

    const voidResult: VoidLineResult = {
      orderId: input.orderId,
      orderLineId: input.orderLineId,
      voidedAmountCents,
      newOrderTotal: updatedOrder?.total ?? 0,
      wasteTracking: input.wasteTracking ?? false,
    };

    const event = buildEventFromContext(ctx, 'order.line.voided.v1', {
      orderId: input.orderId,
      orderLineId: input.orderLineId,
      voidedAmountCents,
      reason: input.reason,
      approvedBy: input.approvedBy,
      wasteTracking: input.wasteTracking ?? false,
      locationId: input.locationId,
      catalogItemId: line.catalogItemId,
      catalogItemName: line.catalogItemName,
      subDepartmentId: line.subDepartmentId,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'voidOrderLine', voidResult);
    }

    return { result: voidResult, events: [event] };
  });

  await auditLog(ctx, 'order.line.voided', 'order_line', input.orderLineId);
  return result;
}
