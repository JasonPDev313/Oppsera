import { eq, and, sql } from 'drizzle-orm';
import { withTenant, locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { computeBusinessDate } from '../business-date';

// ── Input shape ────────────────────────────────────────────────────

interface ModifierEntry {
  modifierId: string;
  modifierGroupId: string | null;
  name: string;
  priceAdjustmentCents: number;
  instruction: 'none' | 'extra' | 'on_side' | null;
  isDefault: boolean;
}

interface AssignedModifierGroup {
  modifierGroupId: string;
  groupName: string | null;
  isRequired: boolean;
}

interface OrderPlacedModifierData {
  eventId: string;
  tenantId: string;
  occurredAt: string;
  locationId: string;
  businessDate?: string;
  lines: Array<{
    catalogItemId: string;
    catalogItemName: string;
    qty: number;
    modifiers: ModifierEntry[];
    assignedModifierGroupIds: AssignedModifierGroup[];
  }>;
}

const CONSUMER_NAME = 'modifier-reporting';

/**
 * Computes the daypart bucket from an ISO datetime string and timezone.
 *
 * Buckets:
 *   breakfast  — hour < 11
 *   lunch      — 11 <= hour < 14
 *   afternoon  — 14 <= hour < 17
 *   dinner     — 17 <= hour < 21
 *   late_night — hour >= 21
 */
function computeDaypart(occurredAt: string, timezone: string): string {
  const ts = new Date(occurredAt);
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(ts);
  const hour = parseInt(hourStr, 10);

  if (hour < 11) return 'breakfast';
  if (hour < 14) return 'lunch';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'dinner';
  return 'late_night';
}

/**
 * Handles order.placed.v1 events for modifier reporting read models.
 *
 * Atomically (single transaction):
 * 1. Insert processed_events (idempotency guard)
 * 2. Upsert rm_modifier_item_sales per modifier per line
 * 3. Upsert rm_modifier_daypart per modifier per line
 * 4. Upsert rm_modifier_group_attach per assigned group per line
 */
export async function handleOrderPlacedModifiers(data: OrderPlacedModifierData): Promise<void> {
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
    const daypart = computeDaypart(occurredAt, timezone);

    // Step 3: Process each line
    for (const line of data.lines) {
      const qty = line.qty ?? 1;

      // ── 3a: Per-modifier upserts (rm_modifier_item_sales + rm_modifier_daypart)
      for (const mod of line.modifiers) {
        // Skip modifiers without a group ID — ungrouped modifiers are not tracked
        if (!mod.modifierGroupId) continue;

        // Cents → dollars at the consumer boundary
        const revenueDollars = (mod.priceAdjustmentCents * qty) / 100;
        const extraRevenueDollars =
          mod.instruction === 'extra' ? (mod.priceAdjustmentCents * qty) / 100 : 0;

        // Instruction counters — multiply by line qty
        const instrNone = (mod.instruction === 'none' || mod.instruction === null) ? qty : 0;
        const instrExtra = mod.instruction === 'extra' ? qty : 0;
        const instrOnSide = mod.instruction === 'on_side' ? qty : 0;
        const instrDefault = mod.isDefault ? qty : 0;

        // Upsert rm_modifier_item_sales
        await (tx as any).execute(sql`
          INSERT INTO rm_modifier_item_sales (
            id, tenant_id, location_id, business_date,
            modifier_id, modifier_group_id, catalog_item_id,
            modifier_name, group_name, catalog_item_name,
            times_selected, revenue_dollars, extra_revenue_dollars,
            instruction_none, instruction_extra, instruction_on_side, instruction_default,
            created_at, updated_at
          )
          VALUES (
            ${generateUlid()}, ${tenantId}, ${locationId}, ${businessDate},
            ${mod.modifierId}, ${mod.modifierGroupId}, ${line.catalogItemId},
            ${mod.name}, ${null}, ${line.catalogItemName},
            ${qty}, ${revenueDollars}, ${extraRevenueDollars},
            ${instrNone}, ${instrExtra}, ${instrOnSide}, ${instrDefault},
            NOW(), NOW()
          )
          ON CONFLICT (tenant_id, location_id, business_date, modifier_id, catalog_item_id)
          DO UPDATE SET
            times_selected        = rm_modifier_item_sales.times_selected + ${qty},
            revenue_dollars       = rm_modifier_item_sales.revenue_dollars + ${revenueDollars},
            extra_revenue_dollars = rm_modifier_item_sales.extra_revenue_dollars + ${extraRevenueDollars},
            instruction_none      = rm_modifier_item_sales.instruction_none + ${instrNone},
            instruction_extra     = rm_modifier_item_sales.instruction_extra + ${instrExtra},
            instruction_on_side   = rm_modifier_item_sales.instruction_on_side + ${instrOnSide},
            instruction_default   = rm_modifier_item_sales.instruction_default + ${instrDefault},
            modifier_name         = ${mod.name},
            catalog_item_name     = ${line.catalogItemName},
            updated_at            = NOW()
        `);

        // Upsert rm_modifier_daypart
        await (tx as any).execute(sql`
          INSERT INTO rm_modifier_daypart (
            id, tenant_id, location_id, business_date,
            modifier_id, modifier_group_id, daypart,
            modifier_name, group_name,
            times_selected, revenue_dollars,
            created_at, updated_at
          )
          VALUES (
            ${generateUlid()}, ${tenantId}, ${locationId}, ${businessDate},
            ${mod.modifierId}, ${mod.modifierGroupId}, ${daypart},
            ${mod.name}, ${null},
            ${qty}, ${revenueDollars},
            NOW(), NOW()
          )
          ON CONFLICT (tenant_id, location_id, business_date, modifier_id, daypart)
          DO UPDATE SET
            times_selected  = rm_modifier_daypart.times_selected + ${qty},
            revenue_dollars = rm_modifier_daypart.revenue_dollars + ${revenueDollars},
            modifier_name   = ${mod.name},
            updated_at      = NOW()
        `);
      }

      // ── 3b: Per-assigned-group upserts (rm_modifier_group_attach)
      for (const group of line.assignedModifierGroupIds) {
        // Collect modifiers actually selected for this group
        const selectedForGroup = line.modifiers.filter(
          (m) => m.modifierGroupId === group.modifierGroupId,
        );

        const hasSelection = selectedForGroup.length > 0;
        const linesWithSelection = hasSelection ? qty : 0;
        const totalModifierSelections = selectedForGroup.length * qty;

        // Count unique modifier IDs selected for this group
        const uniqueModifierIds = new Set(selectedForGroup.map((m) => m.modifierId));
        const uniqueModifiersSelected = uniqueModifierIds.size;

        // Sum revenue impact (cents → dollars) for this group's selected modifiers
        const revenueImpactDollars =
          selectedForGroup.reduce((sum, m) => sum + m.priceAdjustmentCents * qty, 0) / 100;

        await (tx as any).execute(sql`
          INSERT INTO rm_modifier_group_attach (
            id, tenant_id, location_id, business_date,
            modifier_group_id, group_name, is_required,
            eligible_line_count, lines_with_selection,
            total_modifier_selections, unique_modifiers_selected,
            revenue_impact_dollars,
            created_at, updated_at
          )
          VALUES (
            ${generateUlid()}, ${tenantId}, ${locationId}, ${businessDate},
            ${group.modifierGroupId}, ${group.groupName}, ${group.isRequired},
            ${qty}, ${linesWithSelection},
            ${totalModifierSelections}, ${uniqueModifiersSelected},
            ${revenueImpactDollars},
            NOW(), NOW()
          )
          ON CONFLICT (tenant_id, location_id, business_date, modifier_group_id)
          DO UPDATE SET
            eligible_line_count        = rm_modifier_group_attach.eligible_line_count + ${qty},
            lines_with_selection       = rm_modifier_group_attach.lines_with_selection + ${linesWithSelection},
            total_modifier_selections  = rm_modifier_group_attach.total_modifier_selections + ${totalModifierSelections},
            unique_modifiers_selected  = rm_modifier_group_attach.unique_modifiers_selected + ${uniqueModifiersSelected},
            revenue_impact_dollars     = rm_modifier_group_attach.revenue_impact_dollars + ${revenueImpactDollars},
            group_name                 = COALESCE(${group.groupName}, rm_modifier_group_attach.group_name),
            is_required                = ${group.isRequired},
            updated_at                 = NOW()
        `);
      }
    }
  });
}
