import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';

interface InventoryMovementData {
  inventoryItemId: string;
  locationId: string;
  itemName: string;
  delta: number;
  newOnHand?: number;
}

const CONSUMER_NAME = 'reporting.inventoryMovement';

/**
 * Handles inventory.movement.created.v1 events.
 *
 * Atomically:
 * 1. Insert processed_events (idempotency)
 * 2. Upsert rm_inventory_on_hand — set absolute onHand if provided, else += delta
 * 3. Recompute isBelowThreshold every time
 */
export async function handleInventoryMovement(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as InventoryMovementData;

  await withTenant(event.tenantId, async (tx) => {
    // Step 1: Atomic idempotency check
    const inserted = await (tx as any).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted as Iterable<{ id: string }>);
    if (rows.length === 0) return;

    // Step 2: Upsert rm_inventory_on_hand
    const locationId = data.locationId || event.locationId || '';
    const itemName = data.itemName;

    if (data.newOnHand !== undefined && data.newOnHand !== null) {
      // Absolute value provided — set directly
      const onHand = data.newOnHand;
      await (tx as any).execute(sql`
        INSERT INTO rm_inventory_on_hand (id, tenant_id, location_id, inventory_item_id, item_name, on_hand, is_below_threshold, updated_at)
        VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${data.inventoryItemId}, ${itemName}, ${onHand}, ${onHand} < 0, NOW())
        ON CONFLICT (tenant_id, location_id, inventory_item_id)
        DO UPDATE SET
          on_hand = ${onHand},
          item_name = ${itemName},
          is_below_threshold = ${onHand} < rm_inventory_on_hand.low_stock_threshold,
          updated_at = NOW()
      `);
    } else {
      // Delta mode — add to existing
      const delta = data.delta;
      await (tx as any).execute(sql`
        INSERT INTO rm_inventory_on_hand (id, tenant_id, location_id, inventory_item_id, item_name, on_hand, is_below_threshold, updated_at)
        VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${data.inventoryItemId}, ${itemName}, ${delta}, ${delta} < 0, NOW())
        ON CONFLICT (tenant_id, location_id, inventory_item_id)
        DO UPDATE SET
          on_hand = rm_inventory_on_hand.on_hand + ${delta},
          item_name = ${itemName},
          is_below_threshold = (rm_inventory_on_hand.on_hand + ${delta}) < rm_inventory_on_hand.low_stock_threshold,
          updated_at = NOW()
      `);
    }
  });
}
