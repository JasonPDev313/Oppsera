import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { orders, orderLines, orderLineTaxes } from '@oppsera/db';
import { eq, and, inArray } from 'drizzle-orm';
import type { CloneOrderInput } from '../validation';
import { getNextOrderNumber } from '../helpers/order-number';
import { checkIdempotency, saveIdempotencyKey } from '../helpers/idempotency';

/**
 * Clone an order's line items into a new open order.
 *
 * Copies lines (with prices, taxes, modifiers) but intentionally zeroes
 * service charges and discounts — these are contextual to the original
 * transaction and must be re-applied manually on the new order.
 * Total = subtotal + taxTotal (no charges/discounts).
 */
export async function cloneOrder(ctx: RequestContext, sourceOrderId: string, input: CloneOrderInput) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const businessDate = new Date().toISOString().split('T')[0]!;

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'cloneOrder');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as typeof orders.$inferSelect, events: [] };

    // Fetch source order
    const [source] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, sourceOrderId), eq(orders.tenantId, ctx.tenantId)));
    if (!source) {
      throw new AppError('NOT_FOUND', 'Source order not found', 404);
    }

    // Fetch source lines and their tax breakdown rows in parallel
    const sourceLines = await tx
      .select()
      .from(orderLines)
      .where(and(eq(orderLines.orderId, sourceOrderId), eq(orderLines.tenantId, ctx.tenantId)));

    const sourceLineTaxes = sourceLines.length > 0
      ? await tx
          .select()
          .from(orderLineTaxes)
          .where(inArray(orderLineTaxes.orderLineId, sourceLines.map((l) => l.id)))
      : [];

    // Create new order
    const orderNumber = await getNextOrderNumber(tx, ctx.tenantId, ctx.locationId!);

    const [created] = await tx.insert(orders).values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!,
      orderNumber,
      status: 'open',
      source: source.source,
      customerId: source.customerId,
      businessDate,
      notes: source.notes ? `Cloned from #${source.orderNumber}` : null,
      terminalId: source.terminalId,
      employeeId: ctx.user.id,
      shiftId: source.shiftId,
      subtotal: source.subtotal,
      taxTotal: source.taxTotal,
      serviceChargeTotal: 0,
      discountTotal: 0,
      total: source.subtotal + source.taxTotal,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    }).returning();

    // Copy lines (returning new IDs so we can remap tax rows)
    const newLineIdBySourceId = new Map<string, string>();
    if (sourceLines.length > 0) {
      const newLines = await tx.insert(orderLines).values(
        sourceLines.map((line, idx: number) => ({
          tenantId: ctx.tenantId,
          locationId: ctx.locationId!,
          orderId: created!.id,
          sortOrder: idx,
          catalogItemId: line.catalogItemId,
          catalogItemName: line.catalogItemName,
          catalogItemSku: line.catalogItemSku,
          itemType: line.itemType,
          qty: line.qty,
          unitPrice: line.unitPrice,
          originalUnitPrice: line.originalUnitPrice,
          priceOverrideReason: line.priceOverrideReason,
          lineSubtotal: line.lineSubtotal,
          lineTax: line.lineTax,
          lineTotal: line.lineTotal,
          taxCalculationMode: line.taxCalculationMode,
          modifiers: line.modifiers,
          specialInstructions: line.specialInstructions,
          selectedOptions: line.selectedOptions,
          packageComponents: line.packageComponents,
          notes: line.notes,
        })),
      ).returning({ id: orderLines.id });

      // Build source-line-id → new-line-id mapping (insertion order matches sourceLines order)
      sourceLines.forEach((sourceLine, idx) => {
        const newLine = newLines[idx];
        if (newLine) newLineIdBySourceId.set(sourceLine.id, newLine.id);
      });

      // Copy tax breakdown rows, remapped to new line IDs
      if (sourceLineTaxes.length > 0) {
        const taxRowsToInsert = sourceLineTaxes
          .map((tax) => {
            const newLineId = newLineIdBySourceId.get(tax.orderLineId);
            if (!newLineId) return null;
            return {
              tenantId: ctx.tenantId,
              orderLineId: newLineId,
              taxRateId: tax.taxRateId,
              taxName: tax.taxName,
              rateDecimal: tax.rateDecimal,
              amount: tax.amount,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        if (taxRowsToInsert.length > 0) {
          await tx.insert(orderLineTaxes).values(taxRowsToInsert);
        }
      }
    }

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'cloneOrder', created!);

    const event = buildEventFromContext(ctx, 'order.cloned.v1', {
      sourceOrderId,
      sourceOrderNumber: source.orderNumber,
      newOrderId: created!.id,
      newOrderNumber: created!.orderNumber,
      lineCount: sourceLines.length,
    });

    return { result: created!, events: [event] };
  });

  auditLogDeferred(ctx, 'order.cloned', 'order', result.id);
  return result;
}
