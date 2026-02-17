import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, NotFoundError, ValidationError } from '@oppsera/shared';
import { inventoryItems, inventoryMovements } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { getOnHand } from '../helpers/get-on-hand';
import { checkStockAlerts } from '../helpers/stock-alerts';
import type { RecordShrinkInput } from '../validation';

export async function recordShrink(
  ctx: RequestContext,
  input: RecordShrinkInput,
) {
  if (!ctx.locationId) {
    throw new AppError(
      'LOCATION_REQUIRED',
      'X-Location-Id header is required',
      400,
    );
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Look up inventory item and verify tenant/location ownership
    const items = await (tx as any)
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.tenantId, ctx.tenantId),
          eq(inventoryItems.id, input.inventoryItemId),
          eq(inventoryItems.locationId, ctx.locationId!),
        ),
      );
    const item = items[0];
    if (!item) {
      throw new NotFoundError('Inventory item');
    }

    // 2. Check if shrink would result in negative inventory
    const currentOnHandBefore = await getOnHand(tx, ctx.tenantId, item.id);
    const projectedOnHand = currentOnHandBefore - input.quantity;

    if (projectedOnHand < 0 && !item.allowNegative) {
      throw new ValidationError(
        'Shrink would result in negative inventory',
      );
    }

    // 3. Calculate cost values
    const unitCostStr = input.unitCost != null ? input.unitCost.toFixed(2) : null;
    const extendedCostStr =
      input.unitCost != null
        ? (input.quantity * input.unitCost).toFixed(2)
        : null;

    // 4. Insert movement (quantity stored as negative delta)
    const [created] = await (tx as any)
      .insert(inventoryMovements)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
        inventoryItemId: item.id,
        movementType: 'shrink',
        quantityDelta: (-input.quantity).toString(),
        unitCost: unitCostStr,
        extendedCost: extendedCostStr,
        reason: input.reason,
        source: 'manual',
        businessDate: input.businessDate,
        employeeId: input.employeeId ?? null,
        terminalId: input.terminalId ?? null,
        metadata: { shrinkType: input.shrinkType },
        createdBy: ctx.user.id,
      })
      .returning();

    const movement = created!;

    // 5. Get new on-hand quantity
    const currentOnHand = await getOnHand(tx, ctx.tenantId, item.id);

    // 6. Check stock alerts
    const alertEvents = checkStockAlerts(ctx, {
      inventoryItemId: item.id,
      catalogItemId: item.catalogItemId,
      locationId: ctx.locationId!,
      itemName: item.name,
      currentOnHand,
      reorderPoint: item.reorderPoint != null ? parseFloat(item.reorderPoint) : null,
      reorderQuantity: item.reorderQuantity != null ? parseFloat(item.reorderQuantity) : null,
    });

    // 7. Build primary event (reuse adjusted event type)
    const event = buildEventFromContext(ctx, 'inventory.adjusted.v1', {
      inventoryItemId: item.id,
      catalogItemId: item.catalogItemId,
      locationId: ctx.locationId!,
      quantityDelta: -input.quantity,
      reason: input.reason,
      movementId: movement.id,
    });

    return {
      result: { movement, currentOnHand, inventoryItem: item },
      events: [event, ...alertEvents],
    };
  });

  await auditLog(ctx, 'inventory.shrink', 'inventory_item', input.inventoryItemId);
  return result;
}
