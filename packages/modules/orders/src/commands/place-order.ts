import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ValidationError } from '@oppsera/shared';
import { orders, orderLines, orderCharges, orderDiscounts, orderLineTaxes } from '@oppsera/db';
import { eq, inArray } from 'drizzle-orm';
import type { PlaceOrderInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { fetchOrderForMutation, incrementVersion } from '../helpers/optimistic-lock';

export async function placeOrder(ctx: RequestContext, orderId: string, input: PlaceOrderInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'placeOrder');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    const order = await fetchOrderForMutation(tx, ctx.tenantId, orderId, 'open');

    // Must have at least one line
    const lines = await (tx as any).select().from(orderLines).where(eq(orderLines.orderId, orderId));
    if (lines.length === 0) {
      throw new ValidationError('Order must have at least one line item');
    }

    // Build receipt snapshot
    const charges = await (tx as any).select().from(orderCharges).where(eq(orderCharges.orderId, orderId));
    const discounts = await (tx as any).select().from(orderDiscounts).where(eq(orderDiscounts.orderId, orderId));

    const lineIds = lines.map((l: any) => l.id);
    let lineTaxes: any[] = [];
    if (lineIds.length > 0) {
      lineTaxes = await (tx as any).select().from(orderLineTaxes)
        .where(inArray(orderLineTaxes.orderLineId, lineIds));
    }

    const receiptSnapshot = {
      lines: lines.map((l: any) => ({
        id: l.id,
        name: l.catalogItemName,
        sku: l.catalogItemSku,
        qty: Number(l.qty),
        unitPrice: l.unitPrice,
        lineSubtotal: l.lineSubtotal,
        lineTax: l.lineTax,
        lineTotal: l.lineTotal,
        modifiers: l.modifiers,
        taxes: lineTaxes
          .filter((t: any) => t.orderLineId === l.id)
          .map((t: any) => ({ name: t.taxName, rate: Number(t.rateDecimal), amount: t.amount })),
      })),
      charges: charges.map((c: any) => ({
        name: c.name,
        amount: c.amount,
      })),
      discounts: discounts.map((d: any) => ({
        type: d.type,
        amount: d.amount,
        reason: d.reason,
      })),
      subtotal: order.subtotal,
      taxTotal: order.taxTotal,
      serviceChargeTotal: order.serviceChargeTotal,
      discountTotal: order.discountTotal,
      total: order.total,
    };

    const now = new Date();
    await (tx as any).update(orders).set({
      status: 'placed',
      placedAt: now,
      receiptSnapshot,
      updatedBy: ctx.user.id,
      updatedAt: now,
    }).where(eq(orders.id, orderId));

    await incrementVersion(tx, orderId);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'placeOrder', { orderId });

    const event = buildEventFromContext(ctx, 'order.placed.v1', {
      orderId,
      orderNumber: order.orderNumber,
      locationId: order.locationId,
      businessDate: order.businessDate,
      subtotal: order.subtotal,
      taxTotal: order.taxTotal,
      discountTotal: order.discountTotal ?? 0,
      total: order.total,
      lineCount: lines.length,
      customerId: order.customerId ?? null,
      lines: lines.map((l: any) => ({
        catalogItemId: l.catalogItemId,
        catalogItemName: l.catalogItemName ?? 'Unknown',
        qty: Number(l.qty),
        unitPrice: l.unitPrice ?? 0,
        lineSubtotal: l.lineSubtotal ?? 0,
        lineTax: l.lineTax ?? 0,
        lineTotal: l.lineTotal ?? 0,
        packageComponents: l.packageComponents ?? null,
      })),
    });

    return { result: { ...order, status: 'placed', placedAt: now, receiptSnapshot, version: order.version + 1 }, events: [event] };
  });

  await auditLog(ctx, 'order.placed', 'order', orderId);
  return result;
}
