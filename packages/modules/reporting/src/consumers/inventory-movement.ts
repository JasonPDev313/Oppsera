import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { z } from 'zod';

const inventoryMovementSchema = z.object({
  inventoryItemId: z.string(),
  locationId: z.string(),
  itemName: z.string(),
  delta: z.number(),
  newOnHand: z.number().optional(),
  reorderPoint: z.number().optional(),
});

type _InventoryMovementData = z.infer<typeof inventoryMovementSchema>;

const CONSUMER_NAME = 'reporting.inventoryMovement';

/**
 * Handles inventory.movement.created.v1 events.
 *
 * Atomically:
 * 1. Validate event payload with Zod schema
 * 2. Insert processed_events (idempotency)
 * 3. Fetch reorder point from inventory_items if not in event payload
 * 4. Upsert rm_inventory_on_hand — set absolute onHand if provided, else += delta
 * 5. Always update low_stock_threshold + recompute isBelowThreshold
 */
export async function handleInventoryMovement(event: EventEnvelope): Promise<void> {
  const parsed = inventoryMovementSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error(
      `[${CONSUMER_NAME}] Invalid event payload for event ${event.eventId}:`,
      parsed.error.issues,
    );
    return; // Skip — corrupt payload would produce NaN in read models
  }
  const data = parsed.data;

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

    // Step 2: Resolve reorder point — prefer event payload, fall back to inventory_items
    let threshold = data.reorderPoint ?? null;
    if (threshold === null) {
      const rpResult = await (tx as any).execute(sql`
        SELECT COALESCE(reorder_point, '0')::int AS rp
        FROM inventory_items
        WHERE id = ${data.inventoryItemId}
        LIMIT 1
      `);
      const rpRows = Array.from(rpResult as Iterable<{ rp: number }>);
      threshold = rpRows[0]?.rp ?? 0;
    }

    // Step 3: Upsert rm_inventory_on_hand
    const locationId = data.locationId || event.locationId || '';
    const itemName = data.itemName;

    if (data.newOnHand !== undefined && data.newOnHand !== null) {
      // Absolute value provided — set directly
      const onHand = data.newOnHand;
      await (tx as any).execute(sql`
        INSERT INTO rm_inventory_on_hand (id, tenant_id, location_id, inventory_item_id, item_name, on_hand, low_stock_threshold, is_below_threshold, updated_at)
        VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${data.inventoryItemId}, ${itemName}, ${onHand}, ${threshold}, ${onHand < threshold!}, NOW())
        ON CONFLICT (tenant_id, location_id, inventory_item_id)
        DO UPDATE SET
          on_hand = ${onHand},
          item_name = ${itemName},
          low_stock_threshold = ${threshold},
          is_below_threshold = ${onHand} < ${threshold},
          updated_at = NOW()
      `);
    } else {
      // Delta mode — add to existing
      const delta = data.delta;
      await (tx as any).execute(sql`
        INSERT INTO rm_inventory_on_hand (id, tenant_id, location_id, inventory_item_id, item_name, on_hand, low_stock_threshold, is_below_threshold, updated_at)
        VALUES (${generateUlid()}, ${event.tenantId}, ${locationId}, ${data.inventoryItemId}, ${itemName}, ${delta}, ${threshold}, ${delta < threshold!}, NOW())
        ON CONFLICT (tenant_id, location_id, inventory_item_id)
        DO UPDATE SET
          on_hand = rm_inventory_on_hand.on_hand + ${delta},
          item_name = ${itemName},
          low_stock_threshold = ${threshold},
          is_below_threshold = (rm_inventory_on_hand.on_hand + ${delta}) < ${threshold},
          updated_at = NOW()
      `);
    }
  });
}
