import { eq, and, sql, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { inventoryItems, inventoryMovements } from '@oppsera/db';
import { locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';

/**
 * Handles order.placed.v1 events.
 *
 * When an order is placed, deduct inventory for each line item.
 * Package items deduct from each component's inventory, not the package itself.
 * Uses ON CONFLICT DO NOTHING for idempotency via the unique index on
 * (tenant_id, reference_type, reference_id, inventory_item_id, movement_type).
 */
export async function handleOrderPlaced(event: EventEnvelope): Promise<void> {
  const { orderId, locationId, businessDate: eventBusinessDate, lines } = event.data as {
    orderId: string;
    locationId: string;
    businessDate?: string;
    lines?: Array<{
      catalogItemId: string;
      qty: number;
      packageComponents: Array<{ catalogItemId: string; name: string; qty: number }> | null;
    }>;
  };

  if (!lines || lines.length === 0) return;

  await withTenant(event.tenantId, async (tx) => {
    const businessDate = eventBusinessDate || new Date().toISOString().slice(0, 10);
    const createdBy = event.actorUserId || 'system';

    // Aggregate quantities per catalogItemId across all lines and package components.
    // This prevents the idempotency index from silently dropping duplicate deductions
    // when the same catalog item appears in multiple lines or package components.
    const qtyByCatalogItemId = new Map<string, number>();

    for (const line of lines) {
      const lineQty = line.qty;

      if (
        line.packageComponents &&
        Array.isArray(line.packageComponents) &&
        line.packageComponents.length > 0
      ) {
        for (const component of line.packageComponents) {
          const componentQty = component.qty * lineQty;
          qtyByCatalogItemId.set(
            component.catalogItemId,
            (qtyByCatalogItemId.get(component.catalogItemId) || 0) + componentQty,
          );
        }
      } else {
        qtyByCatalogItemId.set(
          line.catalogItemId,
          (qtyByCatalogItemId.get(line.catalogItemId) || 0) + lineQty,
        );
      }
    }

    // Batch-fetch all inventory items for the catalogItemIds in this order
    const catalogItemIds = [...qtyByCatalogItemId.keys()];
    const inventoryItemRows = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.tenantId, event.tenantId),
          eq(inventoryItems.locationId, locationId),
          inArray(inventoryItems.catalogItemId, catalogItemIds),
        ),
      );
    const invItemByCatalogId = new Map(inventoryItemRows.map(r => [r.catalogItemId, r]));

    // Insert one aggregated movement per inventory item
    for (const [catalogItemId, totalQty] of qtyByCatalogItemId) {
      const inventoryItem = invItemByCatalogId.get(catalogItemId);

      if (!inventoryItem) continue;
      if (!inventoryItem.trackInventory) continue;

      await tx.execute(
        sql`INSERT INTO inventory_movements (id, tenant_id, location_id, inventory_item_id, movement_type, quantity_delta, reference_type, reference_id, source, business_date, created_by)
            VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${inventoryItem.id}, ${'sale'}, ${-totalQty}, ${'order'}, ${orderId}, ${'pos'}, ${businessDate}, ${createdBy})
            ON CONFLICT (tenant_id, reference_type, reference_id, inventory_item_id, movement_type) WHERE reference_type IS NOT NULL
            DO NOTHING`,
      );
    }
  });
}

/**
 * Handles order.voided.v1 events.
 *
 * When an order is voided, reverse all sale movements by creating
 * void_reversal movements with the opposite quantity delta.
 * Uses ON CONFLICT DO NOTHING for idempotency.
 */
export async function handleOrderVoided(event: EventEnvelope): Promise<void> {
  const { orderId } = event.data as {
    orderId: string;
  };

  await withTenant(event.tenantId, async (tx) => {
    // Find all sale movements for this order
    const saleMovements = await tx
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.tenantId, event.tenantId),
          eq(inventoryMovements.referenceType, 'order'),
          eq(inventoryMovements.referenceId, orderId),
          eq(inventoryMovements.movementType, 'sale'),
        ),
      );

    const createdBy = event.actorUserId || 'system';

    // Collect all reversal rows, then batch insert with ON CONFLICT DO NOTHING
    const reversalValues = saleMovements.map(movement => {
      const reversalQty = -Number(movement.quantityDelta);
      return {
        id: generateUlid(),
        tenantId: event.tenantId,
        locationId: movement.locationId,
        inventoryItemId: movement.inventoryItemId,
        movementType: 'void_reversal' as const,
        quantityDelta: String(reversalQty),
        referenceType: 'order' as const,
        referenceId: orderId,
        source: 'pos' as const,
        businessDate: movement.businessDate,
        createdBy,
      };
    });

    if (reversalValues.length > 0) {
      await tx
        .insert(inventoryMovements)
        .values(reversalValues)
        .onConflictDoNothing();
    }
  });
}

/**
 * Handles catalog.item.created.v1 events.
 *
 * When a new catalog item is created, auto-create an inventory_item
 * for each active location in the tenant.
 * Uses ON CONFLICT DO NOTHING via the unique index on
 * (tenant_id, location_id, catalog_item_id) to prevent duplicates.
 */
export async function handleCatalogItemCreated(event: EventEnvelope): Promise<void> {
  const { itemId, name, sku, itemType } = event.data as {
    itemId: string;
    name: string;
    sku: string | null | undefined;
    itemType: string;
  };

  const createdBy = event.actorUserId || 'system';

  await withTenant(event.tenantId, async (tx) => {
    // Get all active locations for this tenant
    const activeLocations = await tx
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.tenantId, event.tenantId),
          eq(locations.isActive, true),
        ),
      );

    // Collect all inventory item rows, then batch insert with ON CONFLICT DO NOTHING
    const inventoryItemValues = activeLocations.map(location => ({
      id: generateUlid(),
      tenantId: event.tenantId,
      locationId: location.id,
      catalogItemId: itemId,
      name,
      sku: sku ?? null,
      itemType,
      status: 'active' as const,
      trackInventory: true,
      baseUnit: 'each',
      purchaseUnit: 'each',
      purchaseToBaseRatio: '1',
      costingMethod: 'fifo' as const,
      allowNegative: false,
      createdBy,
    }));

    if (inventoryItemValues.length > 0) {
      await tx
        .insert(inventoryItems)
        .values(inventoryItemValues)
        .onConflictDoNothing();
    }
  });
}

/**
 * Handles catalog.item.archived.v1 events.
 *
 * When a catalog item is archived, cascade the archive status
 * to all inventory_items for that catalog item across all locations.
 */
export async function handleCatalogItemArchived(event: EventEnvelope): Promise<void> {
  const { itemId } = event.data as { itemId: string };

  await withTenant(event.tenantId, async (tx) => {
    await tx
      .update(inventoryItems)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(
        and(
          eq(inventoryItems.tenantId, event.tenantId),
          eq(inventoryItems.catalogItemId, itemId),
        ),
      );
  });
}

/**
 * Handles catalog.item.unarchived.v1 events.
 *
 * When a catalog item is unarchived, restore all inventory_items
 * for that catalog item back to 'active' status.
 */
export async function handleCatalogItemUnarchived(event: EventEnvelope): Promise<void> {
  const { itemId } = event.data as { itemId: string };

  await withTenant(event.tenantId, async (tx) => {
    await tx
      .update(inventoryItems)
      .set({ status: 'active', updatedAt: new Date() })
      .where(
        and(
          eq(inventoryItems.tenantId, event.tenantId),
          eq(inventoryItems.catalogItemId, itemId),
        ),
      );
  });
}
