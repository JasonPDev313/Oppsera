import { eq, and, sql } from 'drizzle-orm';
import { AppError, generateUlid } from '@oppsera/shared';
import { orderLines, orderDiscounts, orders, compEvents } from '@oppsera/db';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '../../helpers/idempotency';
import type { RequestContext } from '../../auth/context';
import type { CompOrderLineInput } from '../validation';
import type { CompEvent } from '../types';

function mapCompRow(row: typeof compEvents.$inferSelect): CompEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    orderId: row.orderId,
    orderLineId: row.orderLineId,
    compType: row.compType as CompEvent['compType'],
    amountCents: row.amountCents,
    reason: row.reason,
    compCategory: row.compCategory as CompEvent['compCategory'],
    approvedBy: row.approvedBy,
    glJournalEntryId: row.glJournalEntryId,
    businessDate: row.businessDate,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Comp an individual order line.
 * Creates a comp_events record AND an order_discounts record (type='comp')
 * to reduce the order total. Recalculates order totals.
 */
export async function compOrderLine(
  ctx: RequestContext,
  input: CompOrderLineInput,
): Promise<CompEvent> {
  const businessDate = input.businessDate ?? new Date().toISOString().slice(0, 10);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'compOrderLine');
      if (check.isDuplicate) {
        return { result: check.originalResult as CompEvent, events: [] };
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
    const compAmountCents = line.lineSubtotal; // comp the full line subtotal

    // Verify order is in a compable state
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
      throw new AppError('ORDER_VOIDED', 'Cannot comp a voided order', 409);
    }

    // Create comp event record
    const compId = generateUlid();
    const [compRow] = await tx
      .insert(compEvents)
      .values({
        id: compId,
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        orderId: input.orderId,
        orderLineId: input.orderLineId,
        compType: 'item',
        amountCents: compAmountCents,
        reason: input.reason,
        compCategory: input.compCategory ?? 'manager',
        approvedBy: input.approvedBy,
        businessDate,
      })
      .returning();

    // Also create an order_discounts record so order totals reflect the comp
    await tx
      .insert(orderDiscounts)
      .values({
        tenantId: ctx.tenantId,
        orderId: input.orderId,
        type: 'comp',
        value: compAmountCents,
        amount: compAmountCents,
        reason: `COMP: ${input.reason}`,
        createdBy: ctx.user.id,
      });

    // Recalculate order totals
    await tx.execute(sql`
      UPDATE orders SET
        discount_total = COALESCE((
          SELECT SUM(amount) FROM order_discounts
          WHERE order_id = ${input.orderId} AND tenant_id = ${ctx.tenantId}
        ), 0),
        total = subtotal
          + COALESCE(tax_total, 0)
          + COALESCE(service_charge_total, 0)
          - COALESCE((
            SELECT SUM(amount) FROM order_discounts
            WHERE order_id = ${input.orderId} AND tenant_id = ${ctx.tenantId}
          ), 0),
        updated_at = NOW()
      WHERE id = ${input.orderId} AND tenant_id = ${ctx.tenantId}
    `);

    const event = buildEventFromContext(ctx, 'order.line.comped.v1', {
      compEventId: compId,
      orderId: input.orderId,
      orderLineId: input.orderLineId,
      amountCents: compAmountCents,
      reason: input.reason,
      compCategory: input.compCategory ?? 'manager',
      approvedBy: input.approvedBy,
      locationId: input.locationId,
      businessDate,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'compOrderLine', mapCompRow(compRow!));
    }

    return { result: mapCompRow(compRow!), events: [event] };
  });

  await auditLog(ctx, 'order.line.comped', 'comp_event', result.id);
  return result;
}
