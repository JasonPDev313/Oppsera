import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ValidationError, generateUlid } from '@oppsera/shared';
import { orders, orderLines } from '@oppsera/db';
import type { InferSelectModel } from 'drizzle-orm';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type { CreateReturnInput } from '../validation';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';
import { getNextOrderNumber } from '../helpers/order-number';

export async function createReturn(
  ctx: RequestContext,
  originalOrderId: string,
  input: CreateReturnInput,
) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createReturn');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as unknown, events: [] };

    // 1. Fetch original order — must be paid
    const [originalOrder] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, ctx.tenantId),
          eq(orders.id, originalOrderId),
        ),
      );

    if (!originalOrder) {
      throw new AppError('ORDER_NOT_FOUND', `Order ${originalOrderId} not found`, 404);
    }

    if (originalOrder.status !== 'paid') {
      throw new ValidationError(
        `Order is in status '${originalOrder.status}', must be 'paid' to return`,
      );
    }

    // 2. Fetch original lines matching the return request
    const originalLineIds = input.returnLines.map(rl => rl.originalLineId);
    const originalLines = await tx
      .select()
      .from(orderLines)
      .where(
        and(
          eq(orderLines.tenantId, ctx.tenantId),
          eq(orderLines.orderId, originalOrderId),
          inArray(orderLines.id, originalLineIds),
        ),
      );

    if (originalLines.length !== originalLineIds.length) {
      const foundIds = new Set(originalLines.map((l) => l.id));
      const missingIds = originalLineIds.filter(id => !foundIds.has(id));
      throw new AppError(
        'LINE_NOT_FOUND',
        `Order lines not found: ${missingIds.join(', ')}`,
        404,
      );
    }

    type OrderLine = InferSelectModel<typeof orderLines>;
    const originalLineMap = new Map(originalLines.map((l) => [l.id, l] as [string, OrderLine]));

    // 3. Fetch previously-returned quantities for these lines (sum across all prior returns)
    const priorReturnLines = await tx
      .select({
        originalLineId: orderLines.originalLineId,
        returnedQty: sql<string>`COALESCE(SUM(ABS(${orderLines.qty}::numeric)), 0)`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orderLines.orderId, orders.id))
      .where(
        and(
          eq(orders.tenantId, ctx.tenantId),
          eq(orders.returnOrderId, originalOrderId),
          inArray(orderLines.originalLineId, originalLineIds),
        ),
      )
      .groupBy(orderLines.originalLineId);

    const priorReturnMap = new Map(
      priorReturnLines.map((r) => [r.originalLineId, Number(r.returnedQty ?? 0)] as [string | null, number]),
    );

    // 4. Validate return quantities against remaining returnable qty
    for (const returnLine of input.returnLines) {
      const orig = originalLineMap.get(returnLine.originalLineId)!;
      const origQty = Number(orig.qty);
      const alreadyReturned = priorReturnMap.get(returnLine.originalLineId) ?? 0;
      const remainingQty = origQty - alreadyReturned;
      if (returnLine.qty > remainingQty) {
        throw new ValidationError(
          `Return qty ${returnLine.qty} exceeds remaining returnable qty ${remainingQty} for line ${returnLine.originalLineId}`,
          [{ field: 'qty', message: `Max returnable qty is ${remainingQty} (${alreadyReturned} already returned)` }],
        );
      }
    }

    // 5. Determine return type (full only if returning all remaining for all lines)
    const isFullReturn = input.returnLines.length === originalLines.length
      && input.returnLines.every(rl => {
        const orig = originalLineMap.get(rl.originalLineId)!;
        const alreadyReturned = priorReturnMap.get(rl.originalLineId) ?? 0;
        return rl.qty === (Number(orig.qty) - alreadyReturned);
      });

    // 5. Create return order
    const orderNumber = await getNextOrderNumber(tx, ctx.tenantId, ctx.locationId!);
    const now = new Date();
    const businessDate = now.toISOString().slice(0, 10);

    const returnOrderId = generateUlid();
    await tx.insert(orders).values({
      id: returnOrderId,
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      orderNumber,
      status: 'paid', // return orders are immediately "paid" (negative amount)
      source: 'pos',
      customerId: originalOrder.customerId,
      businessDate,
      terminalId: originalOrder.terminalId,
      employeeId: ctx.user.id,
      returnType: isFullReturn ? 'full' : 'partial',
      returnOrderId: originalOrderId,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
      placedAt: now,
      paidAt: now,
    });

    // 6. Create return lines with negative amounts
    let returnSubtotal = 0;
    let returnTax = 0;
    const returnLineDetails: Array<{
      lineId: string;
      catalogItemId: string;
      catalogItemName: string;
      qty: number;
      returnedSubtotal: number;
      returnedTax: number;
      returnedTotal: number;
      subDepartmentId: string | null;
      packageComponents: unknown;
    }> = [];

    for (const returnLine of input.returnLines) {
      const orig = originalLineMap.get(returnLine.originalLineId)!;
      const origQty = Number(orig.qty);
      const ratio = returnLine.qty / origQty;

      // Proportional amounts (negative for returns)
      const lineSubtotal = -Math.round(orig.lineSubtotal * ratio);
      const lineTax = -Math.round(orig.lineTax * ratio);
      const lineTotal = lineSubtotal + lineTax;

      returnSubtotal += lineSubtotal;
      returnTax += lineTax;

      const lineId = generateUlid();
      await tx.insert(orderLines).values({
        id: lineId,
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        orderId: returnOrderId,
        catalogItemId: orig.catalogItemId,
        catalogItemName: orig.catalogItemName,
        catalogItemSku: orig.catalogItemSku,
        itemType: orig.itemType,
        qty: String(-returnLine.qty),
        unitPrice: orig.unitPrice,
        lineSubtotal,
        lineTax,
        lineTotal,
        subDepartmentId: orig.subDepartmentId,
        taxGroupId: orig.taxGroupId,
        packageComponents: orig.packageComponents,
        originalLineId: returnLine.originalLineId,
      });

      returnLineDetails.push({
        lineId,
        catalogItemId: orig.catalogItemId,
        catalogItemName: orig.catalogItemName,
        qty: returnLine.qty,
        returnedSubtotal: -lineSubtotal,
        returnedTax: -lineTax,
        returnedTotal: -(lineSubtotal + lineTax),
        subDepartmentId: orig.subDepartmentId ?? null,
        packageComponents: orig.packageComponents ?? null,
      });
    }

    const returnTotal = returnSubtotal + returnTax;

    // 7. Update return order totals
    await tx.update(orders).set({
      subtotal: returnSubtotal,
      taxTotal: returnTax,
      total: returnTotal,
    }).where(eq(orders.id, returnOrderId));

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createReturn', {
      returnOrderId,
      originalOrderId,
    });

    // 8. Emit event
    const event = buildEventFromContext(ctx, 'order.returned.v1', {
      returnOrderId,
      originalOrderId,
      returnType: isFullReturn ? 'full' : 'partial',
      locationId: ctx.locationId,
      businessDate,
      customerId: originalOrder.customerId ?? null,
      returnTotal: -returnTotal, // positive amount representing refund value
      lines: returnLineDetails.map(rl => ({
        catalogItemId: rl.catalogItemId,
        catalogItemName: rl.catalogItemName,
        qty: rl.qty,
        returnedSubtotal: rl.returnedSubtotal,
        returnedTax: rl.returnedTax,
        returnedTotal: rl.returnedTotal,
        subDepartmentId: rl.subDepartmentId,
        packageComponents: rl.packageComponents,
      })),
    });

    return {
      result: {
        returnOrderId,
        originalOrderId,
        orderNumber,
        returnType: isFullReturn ? 'full' : 'partial',
        returnTotal: -returnTotal,
        lines: returnLineDetails,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'order.returned', 'order', originalOrderId);
  return result;
}
