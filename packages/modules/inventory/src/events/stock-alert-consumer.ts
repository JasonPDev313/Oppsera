import { eq, and, gte, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { semanticAlertRules, semanticAlertNotifications } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { auditLogSystem } from '@oppsera/core/audit/helpers';

// ── System alert rule auto-provisioning ──────────────────────────
// The semantic_alert_notifications table requires an FK to alert_rules.
// We lazily create a system-level rule per tenant + alert type.

const SYSTEM_RULE_META = {
  low_stock: {
    name: '[System] Low Stock Alert',
    description: 'Auto-generated alerts when inventory falls below the reorder point.',
    metricSlug: 'inventory.on_hand',
    cooldownMinutes: 60 * 4, // 4 hours between repeated alerts for the same item
  },
  negative_stock: {
    name: '[System] Negative Stock Alert',
    description: 'Auto-generated alerts when inventory goes negative.',
    metricSlug: 'inventory.on_hand',
    cooldownMinutes: 60, // 1 hour — more urgent
  },
} as const;

type SystemRuleType = keyof typeof SYSTEM_RULE_META;

/**
 * Lazily provision (or retrieve) the tenant's system alert rule.
 * Uses upsert semantics — safe for concurrent calls.
 */
async function ensureSystemAlertRule(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  type: SystemRuleType,
): Promise<string> {
  const meta = SYSTEM_RULE_META[type];

  // Check for existing rule
  const [existing] = await tx
    .select({ id: semanticAlertRules.id })
    .from(semanticAlertRules)
    .where(
      and(
        eq(semanticAlertRules.tenantId, tenantId),
        eq(semanticAlertRules.name, meta.name),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  // Create rule
  const ruleId = generateUlid();
  await tx.insert(semanticAlertRules).values({
    id: ruleId,
    tenantId,
    name: meta.name,
    description: meta.description,
    ruleType: 'system',
    metricSlug: meta.metricSlug,
    deliveryChannels: ['in_app'],
    isActive: true,
    cooldownMinutes: meta.cooldownMinutes,
    createdBy: 'system',
  });

  return ruleId;
}

// ── Consumers ────────────────────────────────────────────────────

/**
 * Consumes `inventory.low_stock.v1`.
 *
 * Creates an in-app notification (warning severity) with cooldown dedup.
 * Also writes an audit log entry and structured console output.
 */
export async function handleInventoryLowStock(event: EventEnvelope): Promise<void> {
  const data = event.data as {
    inventoryItemId: string;
    catalogItemId: string;
    locationId: string;
    itemName: string;
    currentOnHand: number;
    reorderPoint: number;
    reorderQuantity: number | null;
  };

  // Structured log for observability
  console.warn('[stock-alert] Low stock detected', {
    tenantId: event.tenantId,
    itemName: data.itemName,
    inventoryItemId: data.inventoryItemId,
    locationId: data.locationId,
    currentOnHand: data.currentOnHand,
    reorderPoint: data.reorderPoint,
  });

  await withTenant(event.tenantId, async (tx) => {
    const ruleId = await ensureSystemAlertRule(tx, event.tenantId, 'low_stock');
    const cooldownMs = SYSTEM_RULE_META.low_stock.cooldownMinutes * 60 * 1000;
    const cooldownCutoff = new Date(Date.now() - cooldownMs);

    // Cooldown dedup: skip if we already notified for this item within the window
    const metricSlug = `inventory.low_stock.${data.inventoryItemId}`;
    const [existing] = await tx
      .select({ id: semanticAlertNotifications.id })
      .from(semanticAlertNotifications)
      .where(
        and(
          eq(semanticAlertNotifications.tenantId, event.tenantId),
          eq(semanticAlertNotifications.metricSlug, metricSlug),
          gte(semanticAlertNotifications.createdAt, cooldownCutoff),
        ),
      )
      .limit(1);

    if (existing) return;

    await tx.insert(semanticAlertNotifications).values({
      id: generateUlid(),
      tenantId: event.tenantId,
      alertRuleId: ruleId,
      title: `Low Stock: ${data.itemName}`,
      body: `${data.itemName} is at ${data.currentOnHand} units (reorder point: ${data.reorderPoint}).${data.reorderQuantity ? ` Suggested reorder: ${data.reorderQuantity} units.` : ''}`,
      severity: 'warning',
      metricSlug,
      metricValue: String(data.currentOnHand),
      baselineValue: String(data.reorderPoint),
      businessDate: new Date().toISOString().slice(0, 10),
      locationId: data.locationId,
      channelsSent: ['in_app'],
    });

    // Update rule trigger stats
    await tx
      .update(semanticAlertRules)
      .set({
        lastTriggeredAt: new Date(),
        triggerCount: sql`${semanticAlertRules.triggerCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(semanticAlertRules.id, ruleId));
  });

  try {
    await auditLogSystem(
      event.tenantId,
      'inventory.low_stock_alert',
      'inventory_item',
      data.inventoryItemId,
      {
        currentOnHand: data.currentOnHand,
        reorderPoint: data.reorderPoint,
        locationId: data.locationId,
        itemName: data.itemName,
      },
    );
  } catch (e) {
    console.error('[stock-alert] Audit log failed for low_stock_alert:', e instanceof Error ? e.message : e);
  }
}

/**
 * Consumes `inventory.negative.v1`.
 *
 * Creates an in-app notification (critical severity) with cooldown dedup.
 * Negative stock is a more urgent condition than low stock.
 */
export async function handleInventoryNegative(event: EventEnvelope): Promise<void> {
  const data = event.data as {
    inventoryItemId: string;
    catalogItemId: string;
    locationId: string;
    itemName: string;
    currentOnHand: number;
  };

  // Structured log — critical level
  console.error('[stock-alert] Negative stock detected', {
    tenantId: event.tenantId,
    itemName: data.itemName,
    inventoryItemId: data.inventoryItemId,
    locationId: data.locationId,
    currentOnHand: data.currentOnHand,
  });

  await withTenant(event.tenantId, async (tx) => {
    const ruleId = await ensureSystemAlertRule(tx, event.tenantId, 'negative_stock');
    const cooldownMs = SYSTEM_RULE_META.negative_stock.cooldownMinutes * 60 * 1000;
    const cooldownCutoff = new Date(Date.now() - cooldownMs);

    const metricSlug = `inventory.negative.${data.inventoryItemId}`;
    const [existing] = await tx
      .select({ id: semanticAlertNotifications.id })
      .from(semanticAlertNotifications)
      .where(
        and(
          eq(semanticAlertNotifications.tenantId, event.tenantId),
          eq(semanticAlertNotifications.metricSlug, metricSlug),
          gte(semanticAlertNotifications.createdAt, cooldownCutoff),
        ),
      )
      .limit(1);

    if (existing) return;

    await tx.insert(semanticAlertNotifications).values({
      id: generateUlid(),
      tenantId: event.tenantId,
      alertRuleId: ruleId,
      title: `Negative Stock: ${data.itemName}`,
      body: `${data.itemName} has gone negative (${data.currentOnHand} units). This may indicate a count discrepancy or missing receiving.`,
      severity: 'critical',
      metricSlug,
      metricValue: String(data.currentOnHand),
      baselineValue: '0',
      businessDate: new Date().toISOString().slice(0, 10),
      locationId: data.locationId,
      channelsSent: ['in_app'],
    });

    await tx
      .update(semanticAlertRules)
      .set({
        lastTriggeredAt: new Date(),
        triggerCount: sql`${semanticAlertRules.triggerCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(semanticAlertRules.id, ruleId));
  });

  try {
    await auditLogSystem(
      event.tenantId,
      'inventory.negative_stock_alert',
      'inventory_item',
      data.inventoryItemId,
      {
        currentOnHand: data.currentOnHand,
        locationId: data.locationId,
        itemName: data.itemName,
      },
    );
  } catch (e) {
    console.error('[stock-alert] Audit log failed for negative_stock_alert:', e instanceof Error ? e.message : e);
  }
}
