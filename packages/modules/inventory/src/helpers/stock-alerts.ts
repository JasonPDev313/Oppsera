import { buildEventFromContext } from '@oppsera/core/events/build-event';
import type { RequestContext } from '@oppsera/core/auth/context';

interface StockAlertInput {
  inventoryItemId: string;
  catalogItemId: string;
  locationId: string;
  itemName: string;
  currentOnHand: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
}

/**
 * Check stock levels and return alert events if needed.
 * Returns an array of events to emit (0, 1, or 2 events).
 */
export function checkStockAlerts(
  ctx: RequestContext,
  input: StockAlertInput,
): ReturnType<typeof buildEventFromContext>[] {
  const events: ReturnType<typeof buildEventFromContext>[] = [];

  // Check for negative stock
  if (input.currentOnHand < 0) {
    events.push(
      buildEventFromContext(ctx, 'inventory.negative.v1', {
        inventoryItemId: input.inventoryItemId,
        catalogItemId: input.catalogItemId,
        locationId: input.locationId,
        itemName: input.itemName,
        currentOnHand: input.currentOnHand,
      }),
    );
  }

  // Check for low stock (only if reorderPoint is set)
  if (
    input.reorderPoint !== null &&
    input.currentOnHand >= 0 &&
    input.currentOnHand <= input.reorderPoint
  ) {
    events.push(
      buildEventFromContext(ctx, 'inventory.low_stock.v1', {
        inventoryItemId: input.inventoryItemId,
        catalogItemId: input.catalogItemId,
        locationId: input.locationId,
        itemName: input.itemName,
        currentOnHand: input.currentOnHand,
        reorderPoint: input.reorderPoint,
        reorderQuantity: input.reorderQuantity,
      }),
    );
  }

  return events;
}
