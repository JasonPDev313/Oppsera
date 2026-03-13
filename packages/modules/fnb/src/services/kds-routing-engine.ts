/**
 * KDS Routing Engine — auto-routing for catalog items to KDS stations.
 *
 * Resolves each ticket item to a station using a priority cascade:
 *   1. Item-specific rule   (ruleType = 'item', matches catalogItemId)
 *   2. Category rule         (ruleType = 'category', matches categoryId)
 *   3. Sub-department rule   (ruleType = 'sub_department', matches subDepartmentId)
 *   4. Department rule       (ruleType = 'department', matches departmentId)
 *   5. Modifier rule         (ruleType = 'modifier', matches any modifierId)
 *   6. Fallback station      (first active prep station; expo excluded)
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
import { logger } from '@oppsera/core/observability';

// ── Types ───────────────────────────────────────────────────────

export interface RoutingContext {
  tenantId: string;
  locationId: string;
  orderType?: string;  // dine_in | takeout | delivery | bar
  channel?: string;    // pos | online | kiosk | third_party
  timezone?: string;   // IANA timezone (e.g. 'America/New_York') for time-window routing
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

/** Returns current time as "HH:MM" string in the given IANA timezone. */
function getCurrentTimeHHMM(timezone?: string): string {
  const now = new Date();
  if (timezone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return `${hh}:${mm}`;
  }
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Check if a rule's conditions match the current routing context. */
function ruleMatchesConditions(rule: RoutingRule, context: RoutingContext): boolean {
  // Order type condition — if a rule restricts to a specific order type,
  // only reject when we KNOW the order type and it doesn't match.
  // When orderType is absent (retail POS), skip this condition so the rule
  // can still route the item to the correct station.
  if (rule.orderTypeCondition && context.orderType) {
    if (rule.orderTypeCondition !== context.orderType) {
      return false;
    }
  }
  // Channel condition — same: only reject when we KNOW the channel and it doesn't match
  if (rule.channelCondition && context.channel) {
    if (rule.channelCondition !== context.channel) {
      return false;
    }
  }
  // Time window condition (uses venue timezone when available)
  if (rule.timeConditionStart && rule.timeConditionEnd) {
    const now = getCurrentTimeHHMM(context.timezone);
    const start = rule.timeConditionStart;
    const end = rule.timeConditionEnd;
    // Handle overnight ranges (e.g. 22:00 – 06:00)
    if (start <= end) {
      if (now < start || now > end) return false;
    } else {
      // Overnight: valid when now >= start OR now <= end
      if (now < start && now > end) return false; // intentional: for overnight, reject only when BOTH conditions true (between end and start)
    }
  }
  return true;
}

/** Check if a station accepts the given order type and channel. */
function stationAcceptsOrder(station: StationMeta, context: RoutingContext): boolean {
  if (station.pauseReceiving) return false;
  // If station restricts order types, only reject when we KNOW the order type and it
  // doesn't match. When orderType is absent (e.g. retail POS with no FnB tab), bypass
  // the filter — retail orders should reach prep stations rather than being silently dropped.
  if (station.allowedOrderTypes.length > 0 && context.orderType) {
    if (!station.allowedOrderTypes.includes(context.orderType)) return false;
  }
  // If station restricts channels, only reject when we KNOW the channel and it doesn't match.
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
      // Skip if station was deleted/inactive, doesn't accept this order,
      // or is an expo station (expo is a monitoring view, not a prep target)
      if (!station || station.stationType === 'expo' || !stationAcceptsOrder(station, context)) continue;
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

  // 3. Sub-department: match sub_department rules by their subDepartmentId column,
  //    AND department rules whose departmentId targets this hierarchy level
  //    (users may create a "department" rule pointing at a mid-level category)
  if (item.subDepartmentId) {
    const subMatch = findFirstValid(
      rules.filter(
        (r) =>
          (r.ruleType === 'sub_department' && r.subDepartmentId === item.subDepartmentId) ||
          (r.ruleType === 'department' && r.departmentId === item.subDepartmentId),
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
 * Bulk-enrich routable items with the full 3-level category hierarchy from
 * the catalog. Items that already have all fields set are left unchanged.
 *
 * Performs a single query with a 3-level join (matching getStationPrepTimeForItem):
 *   - categoryId     = catalog_items.category_id              (level 3, most specific)
 *   - subDepartmentId = catalog_categories.parent_id          (level 2, mid-level)
 *   - departmentId    = grandparent catalog_categories.parent_id (level 1, top-level)
 *
 * Note: hierarchies deeper than 3 levels are not walked — the top 3 ancestor
 * levels are resolved. This covers the standard dept → sub-dept → category model.
 */
export async function enrichRoutableItems(
  tenantId: string,
  items: RoutableItem[],
): Promise<RoutableItem[]> {
  // Collect catalogItemIds that need enrichment (any missing hierarchy level)
  const needsEnrichment = items.filter(
    (item) => !item.categoryId || !item.subDepartmentId || !item.departmentId,
  );
  if (needsEnrichment.length === 0) return items;

  const catalogItemIds = [...new Set(needsEnrichment.map((i) => i.catalogItemId))];
  if (catalogItemIds.length === 0) return items;

  const enrichmentMap = await withTenant(tenantId, async (tx) => {
    // Walk the full 3-level category chain: item → category → sub-dept → dept
    // (matches the hierarchy used by getStationPrepTimeForItem)
    const rows = await tx.execute(
      sql`SELECT ci.id AS catalog_item_id,
                 ci.category_id,
                 c1.parent_id AS sub_department_id,
                 c2.parent_id AS department_id
          FROM catalog_items ci
          LEFT JOIN catalog_categories c1 ON c1.id = ci.category_id
          LEFT JOIN catalog_categories c2 ON c2.id = c1.parent_id
          WHERE ci.tenant_id = ${tenantId}
            AND ci.id IN (${sql.join(catalogItemIds.map((id) => sql`${id}`), sql`, `)})`,
    );
    const map = new Map<string, { categoryId: string | null; subDepartmentId: string | null; departmentId: string | null }>();
    for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
      map.set(r.catalog_item_id as string, {
        categoryId: (r.category_id as string) ?? null,
        subDepartmentId: (r.sub_department_id as string) ?? null,
        departmentId: (r.department_id as string) ?? null,
      });
    }
    return map;
  });

  const enrichedCount = [...enrichmentMap.keys()].length;
  const missedCount = needsEnrichment.filter((i) => !enrichmentMap.has(i.catalogItemId)).length;
  if (missedCount > 0) {
    logger.warn('[kds-routing] catalog enrichment missed items', {
      domain: 'kds',
      tenantId,
      enrichedCount,
      missedCount,
      missedItemIds: needsEnrichment.filter((i) => !enrichmentMap.has(i.catalogItemId)).map((i) => i.catalogItemId).join(','),
    });
  } else {
    logger.debug('[kds-routing] catalog enrichment complete', {
      domain: 'kds',
      tenantId,
      enrichedCount,
      totalItems: items.length,
    });
  }

  return items.map((item) => {
    const enrichment = enrichmentMap.get(item.catalogItemId);
    if (!enrichment) return item;
    return {
      ...item,
      categoryId: item.categoryId ?? enrichment.categoryId,
      subDepartmentId: item.subDepartmentId ?? enrichment.subDepartmentId,
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
 * If no rule matches, falls back to the first eligible prep station at
 * the location (expo is excluded from fallback since it is a monitoring
 * view, not a prep station).
 */
export async function resolveStationRouting(
  context: RoutingContext,
  items: RoutableItem[],
): Promise<RoutingResult[]> {
  if (items.length === 0) return [];

  return withTenant(context.tenantId, async (tx) => {
    // Auto-fetch venue timezone for time-window routing when not provided.
    // Runs inside the existing withTenant to avoid an extra connection checkout.
    // Use a local variable to avoid mutating the caller's context reference.
    let effectiveContext = context;
    if (!context.timezone) {
      try {
        const tzRows = await tx.execute(
          sql`SELECT timezone FROM locations
              WHERE id = ${context.locationId} AND tenant_id = ${context.tenantId}
              LIMIT 1`,
        );
        const tz = Array.from(tzRows as Iterable<Record<string, unknown>>)[0];
        if (tz?.timezone) {
          effectiveContext = { ...context, timezone: tz.timezone as string };
        }
      } catch {
        // Non-critical — falls back to server clock timezone
      }
    }

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
      timeConditionStart: normalizeTimeHHMM((r.time_condition_start as string) ?? null),
      timeConditionEnd: normalizeTimeHHMM((r.time_condition_end as string) ?? null),
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
            CASE WHEN station_type = 'expo' THEN 1 ELSE 0 END,
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

    // Resolve the fallback station ID — first eligible non-expo station.
    // Expo stations display bumped tickets from prep stations, not first-view tickets.
    const fallbackStation = stations.find(
      (s) => s.stationType !== 'expo' && stationAcceptsOrder(s, effectiveContext),
    );
    const fallbackStationId = fallbackStation?.id ?? null;

    // Warn-level when no stations or no rules — these are config issues that
    // cause silent routing failures and should never be hidden behind debug
    const routingMeta = {
      domain: 'kds',
      tenantId: effectiveContext.tenantId,
      locationId: effectiveContext.locationId,
      ruleCount: rules.length,
      stationCount: stations.length,
      itemCount: items.length,
      orderType: effectiveContext.orderType ?? 'none',
      channel: effectiveContext.channel ?? 'none',
      fallbackStationId: fallbackStationId ?? 'none',
      pausedStationCount: stations.filter((s) => s.pauseReceiving).length,
    };

    if (stations.length === 0) {
      logger.warn('[kds-routing] no active stations for location — all items will be unrouted', routingMeta);
    } else if (rules.length === 0) {
      logger.warn('[kds-routing] no active routing rules — all items will use fallback station', routingMeta);
    } else {
      logger.info('[kds-routing] resolveStationRouting loaded', routingMeta);
    }

    // Match each item
    const results: RoutingResult[] = items.map((item) => {
      const match = matchItem(item, rules, effectiveContext, stationMap);

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

    // Summarize routing results
    const matchSummary: Record<string, number> = {};
    for (const r of results) {
      const key = r.matchType ?? 'unrouted';
      matchSummary[key] = (matchSummary[key] ?? 0) + 1;
    }
    const unroutedCount = results.filter((r) => !r.stationId).length;

    if (unroutedCount > 0) {
      logger.warn('[kds-routing] items could not be routed to any station', {
        domain: 'kds',
        tenantId: effectiveContext.tenantId,
        locationId: effectiveContext.locationId,
        unroutedCount,
        totalItems: items.length,
        matchSummary,
        unroutedItemIds: results.filter((r) => !r.stationId).map((r) => r.orderLineId).join(','),
      });
    } else {
      logger.info('[kds-routing] all items routed successfully', {
        domain: 'kds',
        tenantId: effectiveContext.tenantId,
        locationId: effectiveContext.locationId,
        totalItems: items.length,
        matchSummary,
      });
    }

    return results;
  });
}

// ── Helpers ─────────────────────────────────────────────────────

/** Normalize a time string to zero-padded HH:MM for correct lexicographic comparison.
 *  Handles "9:00" → "09:00", "14:5" → "14:05", null → null. */
function normalizeTimeHHMM(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length < 2) return value;
  const hh = parts[0]!.padStart(2, '0');
  const mm = parts[1]!.padStart(2, '0');
  return `${hh}:${mm}`;
}

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

// ── Location Hierarchy Helpers ───────────────────────────────────

/**
 * Resolves the effective KDS location for routing and ticket creation.
 *
 * Previously this function promoted across site↔venue hierarchy (e.g., if a
 * tab was at a site but routing rules existed at a child venue, it would
 * return the venue's locationId). This caused a read/write mismatch: the
 * frontend queries tickets at the tab's location, but tickets were written
 * to a promoted location the frontend couldn't see.
 *
 * Production diagnostics (2026-03-12) confirmed no active mismatch at any
 * tenant — tickets are stored at the same location as their tabs. The
 * frontend KDS location utility (`kds-location.ts`) explicitly enforces
 * no-promotion. This function now matches that invariant.
 *
 * Stations and routing rules should be configured at the same location
 * where tabs are created. If a tenant needs KDS at multiple hierarchy
 * levels, they should configure stations at each level independently.
 */
export async function resolveKdsLocationId(
  _tenantId: string,
  locationId: string,
): Promise<string> {
  return locationId;
}

// ── Prep Time Helpers ───────────────────────────────────────────

/**
 * Look up the estimated prep time (in seconds) for a catalog item at a
 * specific station. Returns null if no prep time is configured.
 *
 * Resolution priority (most specific wins):
 *   1. Item + station-specific
 *   2. Item + global (null station)
 *   3. Category (level 3) + station-specific
 *   4. Category + global
 *   5. Sub-department (level 2) + station-specific
 *   6. Sub-department + global
 *   7. Department (level 1) + station-specific
 *   8. Department + global
 */
export async function getStationPrepTimeForItem(
  tenantId: string,
  catalogItemId: string,
  stationId: string,
): Promise<number | null> {
  return withTenant(tenantId, async (tx) => {
    // Get the item's category chain in one query
    const chainRows = await tx.execute(
      sql`SELECT ci.category_id AS cat_id,
                 c1.parent_id AS sub_dept_id,
                 c2.parent_id AS dept_id
          FROM catalog_items ci
          LEFT JOIN catalog_categories c1 ON c1.id = ci.category_id
          LEFT JOIN catalog_categories c2 ON c2.id = c1.parent_id
          WHERE ci.id = ${catalogItemId} AND ci.tenant_id = ${tenantId}
          LIMIT 1`,
    );
    const chain = Array.from(chainRows as Iterable<Record<string, unknown>>)[0];
    const catId = (chain?.cat_id as string) ?? null;
    const subDeptId = (chain?.sub_dept_id as string) ?? null;
    const deptId = (chain?.dept_id as string) ?? null;

    // Build target IDs to search for
    const targetConditions = [sql`catalog_item_id = ${catalogItemId}`];
    const categoryIds = [catId, subDeptId, deptId].filter(Boolean) as string[];
    if (categoryIds.length > 0) {
      targetConditions.push(
        sql`category_id IN (${sql.join(categoryIds.map((id) => sql`${id}`), sql`, `)})`,
      );
    }

    const rows = await tx.execute(
      sql`SELECT catalog_item_id, category_id, station_id, estimated_prep_seconds
          FROM fnb_kds_item_prep_times
          WHERE tenant_id = ${tenantId}
            AND is_active = true
            AND (${sql.join(targetConditions, sql` OR `)})
            AND (station_id = ${stationId} OR station_id IS NULL)`,
    );

    // Build maps and resolve with priority cascade
    const specific = new Map<string, number>();
    const fallback = new Map<string, number>();
    for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
      const targetId = (r.catalog_item_id ?? r.category_id) as string;
      const sid = r.station_id as string | null;
      const seconds = Number(r.estimated_prep_seconds);
      if (sid) {
        specific.set(targetId, seconds);
      } else if (!fallback.has(targetId)) {
        fallback.set(targetId, seconds);
      }
    }

    const tryResolve = (id: string): number | undefined =>
      specific.get(id) ?? fallback.get(id);

    return tryResolve(catalogItemId)
      ?? (catId ? tryResolve(catId) : undefined)
      ?? (subDeptId ? tryResolve(subDeptId) : undefined)
      ?? (deptId ? tryResolve(deptId) : undefined)
      ?? null;
  });
}

export interface PrepTimeLookup {
  orderLineId: string;
  catalogItemId: string;
  stationId: string;
}

/**
 * Batched version of getStationPrepTimeForItem — resolves prep times for
 * multiple (catalogItemId, stationId) pairs with hierarchical category fallback.
 *
 * Returns a Map of orderLineId → prep seconds. Items with no configured
 * prep time are omitted from the map.
 *
 * Resolution priority per item (most specific wins):
 *   item+station > item+global > category+station > category+global
 *   > sub-dept+station > sub-dept+global > dept+station > dept+global
 */
export async function getStationPrepTimesForItems(
  tenantId: string,
  lookups: PrepTimeLookup[],
): Promise<Map<string, number>> {
  if (lookups.length === 0) return new Map();

  const catalogItemIds = [...new Set(lookups.map((l) => l.catalogItemId))];
  const stationIds = [...new Set(lookups.map((l) => l.stationId))];

  return withTenant(tenantId, async (tx) => {
    // 1. Enrich with category chain: item → category → sub-dept → dept
    const chainRows = await tx.execute(
      sql`SELECT ci.id AS catalog_item_id,
                 ci.category_id AS cat_id,
                 c1.parent_id AS sub_dept_id,
                 c2.parent_id AS dept_id
          FROM catalog_items ci
          LEFT JOIN catalog_categories c1 ON c1.id = ci.category_id
          LEFT JOIN catalog_categories c2 ON c2.id = c1.parent_id
          WHERE ci.tenant_id = ${tenantId}
            AND ci.id IN (${sql.join(catalogItemIds.map((id) => sql`${id}`), sql`, `)})`,
    );

    const chainMap = new Map<string, {
      catId: string | null;
      subDeptId: string | null;
      deptId: string | null;
    }>();
    for (const r of Array.from(chainRows as Iterable<Record<string, unknown>>)) {
      chainMap.set(r.catalog_item_id as string, {
        catId: (r.cat_id as string) ?? null,
        subDeptId: (r.sub_dept_id as string) ?? null,
        deptId: (r.dept_id as string) ?? null,
      });
    }

    // 2. Collect all category IDs we need to search for
    const allCategoryIds = new Set<string>();
    for (const chain of chainMap.values()) {
      if (chain.catId) allCategoryIds.add(chain.catId);
      if (chain.subDeptId) allCategoryIds.add(chain.subDeptId);
      if (chain.deptId) allCategoryIds.add(chain.deptId);
    }

    // 3. Build target conditions
    const targetConditions = [
      sql`catalog_item_id IN (${sql.join(catalogItemIds.map((id) => sql`${id}`), sql`, `)})`,
    ];
    if (allCategoryIds.size > 0) {
      const catIds = [...allCategoryIds];
      targetConditions.push(
        sql`category_id IN (${sql.join(catIds.map((id) => sql`${id}`), sql`, `)})`,
      );
    }

    // 4. Fetch all matching prep time rows in one query
    const rows = await tx.execute(
      sql`SELECT catalog_item_id, category_id, station_id, estimated_prep_seconds
          FROM fnb_kds_item_prep_times
          WHERE tenant_id = ${tenantId}
            AND is_active = true
            AND (${sql.join(targetConditions, sql` OR `)})
            AND (station_id IN (${sql.join(stationIds.map((id) => sql`${id}`), sql`, `)}) OR station_id IS NULL)`,
    );

    // 5. Build lookup maps keyed by "targetId:stationId" and "targetId" (fallback)
    const specific = new Map<string, number>(); // "targetId:stationId" → seconds
    const fallbackMap = new Map<string, number>(); // "targetId" → seconds
    for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
      const targetId = (r.catalog_item_id ?? r.category_id) as string;
      const sid = r.station_id as string | null;
      const seconds = Number(r.estimated_prep_seconds);
      if (sid) {
        specific.set(`${targetId}:${sid}`, seconds);
      } else if (!fallbackMap.has(targetId)) {
        fallbackMap.set(targetId, seconds);
      }
    }

    // 6. Resolve each lookup through the 8-level priority cascade
    const tryResolve = (id: string, sid: string): number | undefined =>
      specific.get(`${id}:${sid}`) ?? fallbackMap.get(id);

    const result = new Map<string, number>();
    for (const l of lookups) {
      const chain = chainMap.get(l.catalogItemId);

      const resolution =
        tryResolve(l.catalogItemId, l.stationId)
        ?? (chain?.catId ? tryResolve(chain.catId, l.stationId) : undefined)
        ?? (chain?.subDeptId ? tryResolve(chain.subDeptId, l.stationId) : undefined)
        ?? (chain?.deptId ? tryResolve(chain.deptId, l.stationId) : undefined);

      if (resolution !== undefined) {
        result.set(l.orderLineId, resolution);
      }
    }

    return result;
  });
}
