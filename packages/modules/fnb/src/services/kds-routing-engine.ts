/**
 * KDS Routing Engine — auto-routing for catalog items to KDS stations.
 *
 * Resolves each ticket item to a station using a priority cascade:
 *   1. Item-specific rule   (ruleType = 'item', matches catalogItemId)
 *   2. Category rule         (ruleType = 'category', matches categoryId)
 *   3. Sub-department rule   (ruleType = 'sub_department', matches subDepartmentId)
 *   4. Department rule       (ruleType = 'department', matches departmentId)
 *   5. Modifier rule         (ruleType = 'modifier', matches any modifierId)
 *   6. Fallback station      (first expo station, or first active station)
 *
 * Among rules of the same type, highest `priority` wins.
 * Only active rules are considered.
 */

import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

// ── Types ───────────────────────────────────────────────────────

export interface RoutingContext {
  tenantId: string;
  locationId: string;
  orderType?: string;  // dine_in | takeout | delivery | bar
  channel?: string;    // pos | online | kiosk | third_party
}

export interface RoutableItem {
  orderLineId: string;
  catalogItemId: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
  categoryId?: string | null;
  modifierIds?: string[];
}

export interface RoutingResult {
  orderLineId: string;
  stationId: string | null;
  routingRuleId: string | null;
  matchType: 'item' | 'category' | 'sub_department' | 'department' | 'modifier' | 'fallback' | null;
}

// ── Internal Types ──────────────────────────────────────────────

interface RoutingRule {
  id: string;
  ruleType: string;
  catalogItemId: string | null;
  categoryId: string | null;
  modifierId: string | null;
  departmentId: string | null;
  subDepartmentId: string | null;
  stationId: string;
  priority: number;
}

interface FallbackStation {
  id: string;
  stationType: string;
  sortOrder: number;
}

// ── Rule Matching ───────────────────────────────────────────────

/**
 * Walk the priority cascade for a single item. Returns the first matching
 * rule or null if none match.
 */
function matchItem(
  item: RoutableItem,
  rules: RoutingRule[],
): { rule: RoutingRule; matchType: RoutingResult['matchType'] } | null {
  // 1. Item-specific: ruleType = 'item', matches catalogItemId
  const itemRules = rules.filter(
    (r) => r.ruleType === 'item' && r.catalogItemId === item.catalogItemId,
  );
  if (itemRules.length > 0) {
    return { rule: itemRules[0]!, matchType: 'item' };
  }

  // 2. Category: ruleType = 'category', matches categoryId
  if (item.categoryId) {
    const categoryRules = rules.filter(
      (r) => r.ruleType === 'category' && r.categoryId === item.categoryId,
    );
    if (categoryRules.length > 0) {
      return { rule: categoryRules[0]!, matchType: 'category' };
    }
  }

  // 3. Sub-department: ruleType = 'sub_department' or department rule matching subDepartmentId
  if (item.subDepartmentId) {
    const subDeptRules = rules.filter(
      (r) => r.subDepartmentId === item.subDepartmentId &&
        (r.ruleType === 'sub_department' || r.ruleType === 'department'),
    );
    if (subDeptRules.length > 0) {
      return { rule: subDeptRules[0]!, matchType: 'sub_department' };
    }
  }

  // 4. Department: ruleType = 'department', matches departmentId
  if (item.departmentId) {
    const deptRules = rules.filter(
      (r) => r.ruleType === 'department' && r.departmentId === item.departmentId,
    );
    if (deptRules.length > 0) {
      return { rule: deptRules[0]!, matchType: 'department' };
    }
  }

  // 5. Modifier: ruleType = 'modifier', matches any of the item's modifierIds
  if (item.modifierIds && item.modifierIds.length > 0) {
    for (const modId of item.modifierIds) {
      const modRules = rules.filter(
        (r) => r.ruleType === 'modifier' && r.modifierId === modId,
      );
      if (modRules.length > 0) {
        return { rule: modRules[0]!, matchType: 'modifier' };
      }
    }
  }

  return null;
}

// ── Main Entry Point ────────────────────────────────────────────

/**
 * Resolve KDS station routing for a batch of ticket items.
 *
 * Fetches all active routing rules for the tenant+location in a single
 * query, then matches each item against the priority cascade.
 *
 * If no rule matches, falls back to the first expo station at the
 * location, or the first active station by sort order.
 */
export async function resolveStationRouting(
  context: RoutingContext,
  items: RoutableItem[],
): Promise<RoutingResult[]> {
  if (items.length === 0) return [];

  return withTenant(context.tenantId, async (tx) => {
    // Fetch all active routing rules for this tenant+location, ordered by
    // priority descending so the highest-priority rule comes first in each
    // rule type group.
    const ruleRows = await tx.execute(
      sql`SELECT id, rule_type, catalog_item_id, category_id, modifier_id,
                 department_id, sub_department_id, station_id, priority,
                 order_type_condition, channel_condition,
                 time_condition_start, time_condition_end
          FROM fnb_kitchen_routing_rules
          WHERE tenant_id = ${context.tenantId}
            AND location_id = ${context.locationId}
            AND is_active = true
          ORDER BY priority DESC, created_at ASC`,
    );
    const rules: RoutingRule[] = Array.from(
      ruleRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      id: r.id as string,
      ruleType: r.rule_type as string,
      catalogItemId: (r.catalog_item_id as string) ?? null,
      categoryId: (r.category_id as string) ?? null,
      modifierId: (r.modifier_id as string) ?? null,
      departmentId: (r.department_id as string) ?? null,
      subDepartmentId: (r.sub_department_id as string) ?? null,
      stationId: r.station_id as string,
      priority: Number(r.priority),
    }));

    // Fetch fallback stations (for items that match no rule)
    const stationRows = await tx.execute(
      sql`SELECT id, station_type, sort_order
          FROM fnb_kitchen_stations
          WHERE tenant_id = ${context.tenantId}
            AND location_id = ${context.locationId}
            AND is_active = true
          ORDER BY
            CASE WHEN station_type = 'expo' THEN 0 ELSE 1 END,
            sort_order ASC`,
    );
    const stations: FallbackStation[] = Array.from(
      stationRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      id: r.id as string,
      stationType: r.station_type as string,
      sortOrder: Number(r.sort_order),
    }));

    // Resolve the fallback station ID once
    const fallbackStationId = stations.length > 0 ? stations[0]!.id : null;

    // Match each item
    const results: RoutingResult[] = items.map((item) => {
      const match = matchItem(item, rules);

      if (match) {
        return {
          orderLineId: item.orderLineId,
          stationId: match.rule.stationId,
          routingRuleId: match.rule.id,
          matchType: match.matchType,
        };
      }

      // No rule matched — use fallback
      if (fallbackStationId) {
        return {
          orderLineId: item.orderLineId,
          stationId: fallbackStationId,
          routingRuleId: null,
          matchType: 'fallback' as const,
        };
      }

      // No stations at all
      return {
        orderLineId: item.orderLineId,
        stationId: null,
        routingRuleId: null,
        matchType: null,
      };
    });

    return results;
  });
}

// ── Prep Time Helper ────────────────────────────────────────────

/**
 * Look up the estimated prep time (in seconds) for a catalog item at a
 * specific station. Returns null if no prep time is configured.
 *
 * Checks for a station-specific entry first, then falls back to a
 * station-agnostic entry (station_id IS NULL).
 */
export async function getStationPrepTimeForItem(
  tenantId: string,
  catalogItemId: string,
  stationId: string,
): Promise<number | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT estimated_prep_seconds, station_id
          FROM fnb_kds_item_prep_times
          WHERE tenant_id = ${tenantId}
            AND catalog_item_id = ${catalogItemId}
            AND is_active = true
            AND (station_id = ${stationId} OR station_id IS NULL)
          ORDER BY
            CASE WHEN station_id IS NOT NULL THEN 0 ELSE 1 END
          LIMIT 1`,
    );
    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    if (arr.length === 0) return null;
    return Number(arr[0]!.estimated_prep_seconds);
  });
}
