import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError, generateUlid } from '@oppsera/shared';
import { inventoryMovements } from '@oppsera/db';
import { getOnHand } from '../helpers/get-on-hand';
import { checkStockAlerts } from '../helpers/stock-alerts';
import { findByCatalogItemId } from '../helpers/find-by-catalog-item';
import type { TransferInventoryInput } from '../validation';

export async function transferInventory(
  ctx: RequestContext,
  input: TransferInventoryInput,
) {
  // 1. Validate locations are different
  if (input.fromLocationId === input.toLocationId) {
    throw new ValidationError(
      'Source and destination locations must be different',
    );
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 2. Find source inventory item by catalogItemId at fromLocation
    const sourceItem = await findByCatalogItemId(
      tx,
      ctx.tenantId,
      input.catalogItemId,
      input.fromLocationId,
    );
    if (!sourceItem) {
      throw new NotFoundError('No inventory item at source location');
    }

    // 3. Find destination inventory item by catalogItemId at toLocation
    const destItem = await findByCatalogItemId(
      tx,
      ctx.tenantId,
      input.catalogItemId,
      input.toLocationId,
    );
    if (!destItem) {
      throw new NotFoundError('No inventory item at destination location');
    }

    // 4. Check source has sufficient stock (always enforce, regardless of allowNegative)
    const sourceOnHandBefore = await getOnHand(tx, ctx.tenantId, sourceItem.id);
    if (sourceOnHandBefore < input.quantity) {
      throw new ValidationError(
        'Insufficient stock at source location for transfer',
      );
    }

    // 5. Generate batch ID to group the transfer pair
    const batchId = generateUlid();

    // 6. Calculate cost values
    const unitCostStr = input.unitCost != null ? input.unitCost.toFixed(2) : null;
    const extendedCostStr =
      input.unitCost != null
        ? (input.quantity * input.unitCost).toFixed(2)
        : null;

    // 7. Insert transfer_out movement at source
    const [sourceMovementRow] = await (tx as any)
      .insert(inventoryMovements)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.fromLocationId,
        inventoryItemId: sourceItem.id,
        movementType: 'transfer_out',
        quantityDelta: (-input.quantity).toString(),
        unitCost: unitCostStr,
        extendedCost: extendedCostStr,
        referenceType: 'transfer',
        referenceId: batchId,
        reason: input.reason ?? null,
        source: 'manual',
        businessDate: input.businessDate,
        employeeId: input.employeeId ?? null,
        batchId,
        createdBy: ctx.user.id,
      })
      .returning();

    const sourceMovement = sourceMovementRow!;

    // 8. Insert transfer_in movement at destination
    const [destMovementRow] = await (tx as any)
      .insert(inventoryMovements)
      .values({
        tenantId: ctx.tenantId,
        locationId: input.toLocationId,
        inventoryItemId: destItem.id,
        movementType: 'transfer_in',
        quantityDelta: input.quantity.toString(),
        unitCost: unitCostStr,
        extendedCost: extendedCostStr,
        referenceType: 'transfer',
        referenceId: batchId,
        reason: input.reason ?? null,
        source: 'manual',
        businessDate: input.businessDate,
        employeeId: input.employeeId ?? null,
        batchId,
        createdBy: ctx.user.id,
      })
      .returning();

    const destMovement = destMovementRow!;

    // 9. Get new on-hand for both locations
    const sourceOnHand = await getOnHand(tx, ctx.tenantId, sourceItem.id);
    const destOnHand = await getOnHand(tx, ctx.tenantId, destItem.id);

    // 10. Check stock alerts for source item
    const alertEvents = checkStockAlerts(ctx, {
      inventoryItemId: sourceItem.id,
      catalogItemId: sourceItem.catalogItemId,
      locationId: input.fromLocationId,
      itemName: sourceItem.name,
      currentOnHand: sourceOnHand,
      reorderPoint: sourceItem.reorderPoint != null ? parseFloat(sourceItem.reorderPoint) : null,
      reorderQuantity: sourceItem.reorderQuantity != null ? parseFloat(sourceItem.reorderQuantity) : null,
    });

    // 11. Build primary event (reuse adjusted event type)
    const event = buildEventFromContext(ctx, 'inventory.adjusted.v1', {
      inventoryItemId: sourceItem.id,
      catalogItemId: input.catalogItemId,
      locationId: input.fromLocationId,
      quantityDelta: -input.quantity,
      reason: input.reason ?? 'Transfer',
      movementId: sourceMovement.id,
    });

    return {
      result: {
        transferBatchId: batchId,
        sourceMovement,
        destMovement,
        sourceOnHand,
        destOnHand,
      },
      events: [event, ...alertEvents],
    };
  });

  await auditLog(ctx, 'inventory.transferred', 'inventory_item', result.sourceMovement.inventoryItemId);
  return result;
}
