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
 * Rules are further filtered by optional conditions:
 *   - order_type_condition: only match when the order type matches
 *   - channel_condition: only match when the channel matches
 *   - time_condition_start/end: only match within the time window (HH:MM)
 *
 * Stations are filtered by:
 *   - pause_receiving: skip stations that are paused
 *   - allowed_order_types: skip stations that don't accept the order type
 *   - allowed_channels: skip stations that don't accept the channel
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
  orderTypeCondition: string | null;
  channelCondition: string | null;
  timeConditionStart: string | null;
  timeConditionEnd: string | null;
}

interface StationMeta {
  id: string;
  stationType: string;
  sortOrder: number;
  pauseReceiving: boolean;
  allowedOrderTypes: string[];
  allowedChannels: string[];
}

// ── Condition Helpers ───────────────────────────────────────────

/** Returns current time as "HH:MM" string. */
function getCurrentTimeHHMM(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Check if a rule's conditions match the current routing context. */
function ruleMatchesConditions(rule: RoutingRule, context: RoutingContext): boolean {
  // Order type condition
  if (rule.orderTypeCondition && context.orderType && rule.orderTypeCondition !== context.orderType) {
    return false;
  }
  // Channel condition
  if (rule.channelCondition && context.channel && rule.channelCondition !== context.channel) {
    return false;
  }
  // Time window condition
  if (rule.timeConditionStart && rule.timeConditionEnd) {
    const now = getCurrentTimeHHMM();
    const start = rule.timeConditionStart;
    const end = rule.timeConditionEnd;
    // Handle overnight ranges (e.g. 22:00 – 06:00)
    if (start <= end) {
      if (now < start || now > end) return false;
    } else {
      if (now < start && now > end) return false;
    }
  }
  return true;
}

/** Check if a station accepts the given order type and channel. */
function stationAcceptsOrder(station: StationMeta, context: RoutingContext): boolean {
  if (station.pauseReceiving) return false;
  if (station.allowedOrderTypes.length > 0 && context.orderType) {
    if (!station.allowedOrderTypes.includes(context.orderType)) return false;
  }
  if (station.allowedChannels.length > 0 && context.channel) {
    if (!station.allowedChannels.includes(context.channel)) return false;
  }
  return true;
}

// ── Rule Matching ───────────────────────────────────────────────

/**
 * Walk the priority cascade for a single item. Returns the first matching
 * rule whose conditions are satisfied and whose target station accepts the
 * order, or null if none match.
 */
function matchItem(
  item: RoutableItem,
  rules: RoutingRule[],
  context: RoutingContext,
  stationMap: Map<string, StationMeta>,
): { rule: RoutingRule; matchType: RoutingResult['matchType'] } | null {

  /** Find first rule in a filtered set whose conditions + station pass. */
  function findFirstValid(
    candidates: RoutingRule[],
    matchType: RoutingResult['matchType'],
  ): { rule: RoutingRule; matchType: RoutingResult['matchType'] } | null {
    for (const rule of candidates) {
      if (!ruleMatchesConditions(rule, context)) continue;
      const station = stationMap.get(rule.stationId);
      if (station && !stationAcceptsOrder(station, context)) continue;
      return { rule, matchType };
    }
    return null;
  }

  // 1. Item-specific: ruleType = 'item', matches catalogItemId
  const itemMatch = findFirstValid(
    rules.filter((r) => r.ruleType === 'item' && r.catalogItemId === item.catalogItemId),
    'item',
  );
  if (itemMatch) return itemMatch;

  // 2. Category: ruleType = 'category', matches categoryId
  if (item.categoryId) {
    const catMatch = findFirstValid(
      rules.filter((r) => r.ruleType === 'category' && r.categoryId === item.categoryId),
      'category',
    );
    if (catMatch) return catMatch;
  }

  // 3. Sub-department: ruleType = 'sub_department' or department rule matching subDepartmentId
  if (item.subDepartmentId) {
    const subMatch = findFirstValid(
      rules.filter(
        (r) => r.subDepartmentId === item.subDepartmentId &&
          (r.ruleType === 'sub_department' || r.ruleType === 'department'),
      ),
      'sub_department',
    );
    if (subMatch) return subMatch;
  }

  // 4. Department: ruleType = 'department', matches departmentId
  if (item.departmentId) {
    const deptMatch = findFirstValid(
      rules.filter((r) => r.ruleType === 'department' && r.departmentId === item.departmentId),
      'department',
    );
    if (deptMatch) return deptMatch;
  }

  // 5. Modifier: ruleType = 'modifier', matches any of the item's modifierIds
  if (item.modifierIds && item.modifierIds.length > 0) {
    for (const modId of item.modifierIds) {
      const modMatch = findFirstValid(
        rules.filter((r) => r.ruleType === 'modifier' && r.modifierId === modId),
        'modifier',
      );
      if (modMatch) return modMatch;
    }
  }

  return null;
}

// ── Catalog Enrichment ──────────────────────────────────────────

/**
 * Bulk-enrich routable items with `categoryId` and `departmentId` from the
 * catalog. Items that already have these fields set are left unchanged.
 *
 * Performs a single query joining catalog_items → catalog_categories to get:
 *   - categoryId = catalog_items.category_id
 *   - departmentId = catalog_categories.parent_id (the parent of the sub-department)
 */
export async function enrichRoutableItems(
  tenantId: string,
  items: RoutableItem[],
): Promise<RoutableItem[]> {
  // Collect catalogItemIds that need enrichment
  const needsEnrichment = items.filter(
    (item) => !item.categoryId || !item.departmentId,
  );
  if (needsEnrichment.length === 0) return items;

  const catalogItemIds = [...new Set(needsEnrichment.map((i) => i.catalogItemId))];
  if (catalogItemIds.length === 0) return items;

  const enrichmentMap = await withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT ci.id AS catalog_item_id,
                 ci.category_id,
                 cc.parent_id AS department_id
          FROM catalog_items ci
          LEFT JOIN catalog_categories cc ON cc.id = ci.category_id
          WHERE ci.tenant_id = ${tenantId}
            AND ci.id IN (${sql.join(catalogItemIds.map((id) => sql`${id}`), sql`, `)})`,
    );
    const map = new Map<string, { categoryId: string | null; departmentId: string | null }>();
    for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
      map.set(r.catalog_item_id as string, {
        categoryId: (r.category_id as string) ?? null,
        departmentId: (r.department_id as string) ?? null,
      });
    }
    return map;
  });

  return items.map((item) => {
    const enrichment = enrichmentMap.get(item.catalogItemId);
    if (!enrichment) return item;
    return {
      ...item,
      categoryId: item.categoryId ?? enrichment.categoryId,
      departmentId: item.departmentId ?? enrichment.departmentId,
    };
  });
}

// ── Main Entry Point ────────────────────────────────────────────

/**
 * Resolve KDS station routing for a batch of ticket items.
 *
 * Fetches all active routing rules for the tenant+location in a single
 * query, then matches each item against the priority cascade with
 * condition filtering (order type, channel, time window).
 *
 * If no rule matches, falls back to the first eligible station at the
 * location (expo preferred, filtered by pause/allowed settings).
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
      orderTypeCondition: (r.order_type_condition as string) ?? null,
      channelCondition: (r.channel_condition as string) ?? null,
      timeConditionStart: (r.time_condition_start as string) ?? null,
      timeConditionEnd: (r.time_condition_end as string) ?? null,
    }));

    // Fetch all active stations with filtering metadata
    const stationRows = await tx.execute(
      sql`SELECT id, station_type, sort_order,
                 COALESCE(pause_receiving, false) AS pause_receiving,
                 COALESCE(allowed_order_types, '{}') AS allowed_order_types,
                 COALESCE(allowed_channels, '{}') AS allowed_channels
          FROM fnb_kitchen_stations
          WHERE tenant_id = ${context.tenantId}
            AND location_id = ${context.locationId}
            AND is_active = true
          ORDER BY
            CASE WHEN station_type = 'expo' THEN 0 ELSE 1 END,
            sort_order ASC`,
    );
    const stations: StationMeta[] = Array.from(
      stationRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      id: r.id as string,
      stationType: r.station_type as string,
      sortOrder: Number(r.sort_order),
      pauseReceiving: r.pause_receiving === true || r.pause_receiving === 't',
      allowedOrderTypes: parseTextArray(r.allowed_order_types),
      allowedChannels: parseTextArray(r.allowed_channels),
    }));

    // Build station lookup map for rule validation
    const stationMap = new Map<string, StationMeta>();
    for (const s of stations) {
      stationMap.set(s.id, s);
    }

    // Resolve the fallback station ID — first eligible station
    const fallbackStation = stations.find((s) => stationAcceptsOrder(s, context));
    const fallbackStationId = fallbackStation?.id ?? null;

    // Match each item
    const results: RoutingResult[] = items.map((item) => {
      const match = matchItem(item, rules, context, stationMap);

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

      // No eligible stations at all
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

// ── Helpers ─────────────────────────────────────────────────────

/** Parse a Postgres text[] value (comes as string or string[]). */
function parseTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.length > 0);
  if (typeof value === 'string') {
    // Handle Postgres text array literal: '{dine_in,takeout}'
    const trimmed = value.replace(/^\{|\}$/g, '');
    if (trimmed.length === 0) return [];
    return trimmed.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
  }
  return [];
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
