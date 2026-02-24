import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { computeBusinessDate } from '../business-date';

// ── Input shape ────────────────────────────────────────────────────

interface VoidedModifierEntry {
  modifierId: string;
  modifierGroupId: string | null;
  name: string;
  priceAdjustmentCents: number;
}

interface OrderVoidedModifierData {
  eventId: string;
  tenantId: string;
  locationId: string;
  occurredAt: string;
  businessDate?: string;
  lines: Array<{
    catalogItemId: string;
    qty: number;
    modifiers: VoidedModifierEntry[];
  }>;
}

const CONSUMER_NAME = 'modifier-reporting-void';

/**
 * Handles order.voided.v1 events for modifier reporting read models.
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. Upsert rm_modifier_item_sales — increment void_count and void_revenue_dollars
 * 3. Upsert rm_modifier_group_attach — increment void_count per unique group
 */
export async function handleOrderVoidedModifiers(data: OrderVoidedModifierData): Promise<void> {
  const { tenantId, eventId, occurredAt, locationId } = data;

  await withTenant(tenantId, async (tx) => {
    // Step 1: Atomic idempotency check
    const inserted = await (tx as any).execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${tenantId}, ${eventId}, ${CONSUMER_NAME}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted as Iterable<{ id: string }>);
    if (rows.length === 0) return; // Already processed

    // Step 2: Resolve location timezone and business date
    const [location] = await (tx as any)
      .select({ timezone: locations.timezone })
      .from(locations)
      .where(
        and(
          eq(locations.tenantId, tenantId),
          eq(locations.id, locationId),
        ),
      )
      .limit(1);

    const timezone = location?.timezone ?? 'America/New_York';
    const businessDate = data.businessDate ?? computeBusinessDate(occurredAt, timezone);

    // Step 3: Process each line
    for (const line of data.lines) {
      const qty = line.qty ?? 1;

      // Track which modifier group IDs appear on this line for group-level void tracking
      const voidedGroupIds = new Set<string>();

      // ── 3a: Per-modifier void tracking (rm_modifier_item_sales)
      for (const mod of line.modifiers) {
        // Skip modifiers without a group ID — ungrouped modifiers are not tracked
        if (!mod.modifierGroupId) continue;

        // Cents → dollars at the consumer boundary
        const voidRevenueDollars = (mod.priceAdjustmentCents * qty) / 100;

        await (tx as any).execute(sql`
          INSERT INTO rm_modifier_item_sales (
            id, tenant_id, location_id, business_date,
            modifier_id, modifier_group_id, catalog_item_id,
            modifier_name,
            void_count, void_revenue_dollars,
            created_at, updated_at
          )
          VALUES (
            ${generateUlid()}, ${tenantId}, ${locationId}, ${businessDate},
            ${mod.modifierId}, ${mod.modifierGroupId}, ${line.catalogItemId},
            ${mod.name},
            ${qty}, ${voidRevenueDollars},
            NOW(), NOW()
          )
          ON CONFLICT (tenant_id, location_id, business_date, modifier_id, catalog_item_id)
          DO UPDATE SET
            void_count           = rm_modifier_item_sales.void_count + ${qty},
            void_revenue_dollars = rm_modifier_item_sales.void_revenue_dollars + ${voidRevenueDollars},
            modifier_name        = ${mod.name},
            updated_at           = NOW()
        `);

        voidedGroupIds.add(mod.modifierGroupId);
      }

      // ── 3b: Per-group void tracking (rm_modifier_group_attach)
      for (const groupId of voidedGroupIds) {
        await (tx as any).execute(sql`
          INSERT INTO rm_modifier_group_attach (
            id, tenant_id, location_id, business_date,
            modifier_group_id,
            void_count,
            created_at, updated_at
          )
          VALUES (
            ${generateUlid()}, ${tenantId}, ${locationId}, ${businessDate},
            ${groupId},
            ${qty},
            NOW(), NOW()
          )
          ON CONFLICT (tenant_id, location_id, business_date, modifier_group_id)
          DO UPDATE SET
            void_count = rm_modifier_group_attach.void_count + ${qty},
            updated_at = NOW()
        `);
      }
    }
  });
}
