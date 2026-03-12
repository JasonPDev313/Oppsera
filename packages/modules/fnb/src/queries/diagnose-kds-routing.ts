/**
 * KDS Routing Diagnostic — traces the full routing path for a catalog item
 * at a specific location, returning all intermediate results so operators
 * can see exactly where routing succeeds or fails.
 *
 * Usage: GET /api/v1/fnb/kds-settings/diagnostics?catalogItemId=...&locationId=...
 */

import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { resolveStationRouting, enrichRoutableItems } from '../services/kds-routing-engine';
import type { RoutableItem, RoutingResult } from '../services/kds-routing-engine';

export interface KdsDiagnosticInput {
  tenantId: string;
  locationId: string;
  catalogItemId?: string;
  tabId?: string;
  orderType?: string;
  channel?: string;
}

export interface KdsDiagnosticResult {
  location: {
    id: string;
    name: string | null;
    timezone: string | null;
  } | null;
  stations: Array<{
    id: string;
    name: string;
    displayName: string;
    stationType: string;
    isActive: boolean;
    pauseReceiving: boolean;
    allowedOrderTypes: string[];
    allowedChannels: string[];
  }>;
  routingRules: Array<{
    id: string;
    ruleName: string | null;
    ruleType: string;
    departmentId: string | null;
    departmentName: string | null;
    subDepartmentId: string | null;
    subDepartmentName: string | null;
    categoryId: string | null;
    categoryName: string | null;
    catalogItemId: string | null;
    catalogItemName: string | null;
    modifierId: string | null;
    stationId: string;
    stationName: string | null;
    priority: number;
    isActive: boolean;
    orderTypeCondition: string | null;
    channelCondition: string | null;
  }>;
  catalogItem: {
    id: string;
    name: string | null;
    categoryId: string | null;
    categoryName: string | null;
    subDepartmentId: string | null;
    subDepartmentName: string | null;
    departmentId: string | null;
    departmentName: string | null;
  } | null;
  enrichedItem: RoutableItem | null;
  routingResult: RoutingResult | null;
  recentTickets: Array<{
    id: string;
    ticketNumber: number;
    status: string;
    stationId: string | null;
    stationName: string | null;
    createdAt: string;
    itemCount: number;
  }>;
  tabItems: Array<{
    id: string;
    catalogItemName: string;
    courseNumber: number;
    status: string;
    subDepartmentId: string | null;
  }> | null;
  diagnosis: string[];
}

export async function diagnoseKdsRouting(
  input: KdsDiagnosticInput,
): Promise<KdsDiagnosticResult> {
  const diagnosis: string[] = [];
  const result: KdsDiagnosticResult = {
    location: null,
    stations: [],
    routingRules: [],
    catalogItem: null,
    enrichedItem: null,
    routingResult: null,
    recentTickets: [],
    tabItems: null,
    diagnosis,
  };

  await withTenant(input.tenantId, async (tx) => {
    // 1. Check location exists and get timezone
    const locRows = await tx.execute(
      sql`SELECT id, name, timezone FROM locations
          WHERE id = ${input.locationId} AND tenant_id = ${input.tenantId}
          LIMIT 1`,
    );
    const loc = Array.from(locRows as Iterable<Record<string, unknown>>)[0];
    if (!loc) {
      diagnosis.push(`FAIL: Location ${input.locationId} not found for tenant`);
      return;
    }
    result.location = {
      id: loc.id as string,
      name: (loc.name as string) ?? null,
      timezone: (loc.timezone as string) ?? null,
    };
    diagnosis.push(`OK: Location "${loc.name}" found (timezone: ${loc.timezone ?? 'not set'})`);

    // 2. Check stations
    const stationRows = await tx.execute(
      sql`SELECT id, name, display_name, station_type, is_active, pause_receiving,
                 COALESCE(allowed_order_types, '{}') AS allowed_order_types,
                 COALESCE(allowed_channels, '{}') AS allowed_channels
          FROM fnb_kitchen_stations
          WHERE tenant_id = ${input.tenantId} AND location_id = ${input.locationId}
          ORDER BY sort_order ASC`,
    );
    result.stations = Array.from(stationRows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      displayName: r.display_name as string,
      stationType: r.station_type as string,
      isActive: r.is_active as boolean,
      pauseReceiving: (r.pause_receiving as boolean) ?? false,
      allowedOrderTypes: parseTextArray(r.allowed_order_types),
      allowedChannels: parseTextArray(r.allowed_channels),
    }));

    const activeStations = result.stations.filter((s) => s.isActive);
    const prepStations = activeStations.filter((s) => s.stationType !== 'expo');

    if (result.stations.length === 0) {
      diagnosis.push('FAIL: No KDS stations configured at this location');
      return;
    }
    diagnosis.push(`OK: ${result.stations.length} station(s) found (${activeStations.length} active, ${prepStations.length} prep/bar)`);

    if (activeStations.length === 0) {
      diagnosis.push('FAIL: All stations are disabled (is_active = false)');
    }
    for (const s of activeStations) {
      if (s.pauseReceiving) {
        diagnosis.push(`WARN: Station "${s.displayName}" is paused (pause_receiving = true)`);
      }
      if (s.allowedOrderTypes.length > 0) {
        diagnosis.push(`INFO: Station "${s.displayName}" restricts order types to: [${s.allowedOrderTypes.join(', ')}]`);
        if (input.orderType && !s.allowedOrderTypes.includes(input.orderType)) {
          diagnosis.push(`WARN: Station "${s.displayName}" does NOT accept order type "${input.orderType}"`);
        }
      }
      if (s.allowedChannels.length > 0) {
        diagnosis.push(`INFO: Station "${s.displayName}" restricts channels to: [${s.allowedChannels.join(', ')}]`);
      }
    }

    // 3. Check routing rules
    const ruleRows = await tx.execute(
      sql`SELECT rr.id, rr.rule_name, rr.rule_type, rr.department_id, rr.sub_department_id,
                 rr.category_id, rr.catalog_item_id, rr.modifier_id, rr.station_id,
                 rr.priority, rr.is_active, rr.order_type_condition, rr.channel_condition,
                 ks.display_name AS station_name,
                 dept.name AS department_name,
                 subdept.name AS sub_department_name,
                 cat.name AS category_name,
                 ci.name AS catalog_item_name
          FROM fnb_kitchen_routing_rules rr
          LEFT JOIN fnb_kitchen_stations ks ON ks.id = rr.station_id
          LEFT JOIN catalog_categories dept ON dept.id = rr.department_id
          LEFT JOIN catalog_categories subdept ON subdept.id = rr.sub_department_id
          LEFT JOIN catalog_categories cat ON cat.id = rr.category_id
          LEFT JOIN catalog_items ci ON ci.id = rr.catalog_item_id
          WHERE rr.tenant_id = ${input.tenantId} AND rr.location_id = ${input.locationId}
          ORDER BY rr.priority DESC, rr.created_at ASC`,
    );
    result.routingRules = Array.from(ruleRows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      ruleName: (r.rule_name as string) ?? null,
      ruleType: r.rule_type as string,
      departmentId: (r.department_id as string) ?? null,
      departmentName: (r.department_name as string) ?? null,
      subDepartmentId: (r.sub_department_id as string) ?? null,
      subDepartmentName: (r.sub_department_name as string) ?? null,
      categoryId: (r.category_id as string) ?? null,
      categoryName: (r.category_name as string) ?? null,
      catalogItemId: (r.catalog_item_id as string) ?? null,
      catalogItemName: (r.catalog_item_name as string) ?? null,
      modifierId: (r.modifier_id as string) ?? null,
      stationId: r.station_id as string,
      stationName: (r.station_name as string) ?? null,
      priority: Number(r.priority),
      isActive: r.is_active as boolean,
      orderTypeCondition: (r.order_type_condition as string) ?? null,
      channelCondition: (r.channel_condition as string) ?? null,
    }));

    const activeRules = result.routingRules.filter((r) => r.isActive);
    diagnosis.push(`OK: ${result.routingRules.length} routing rule(s) found (${activeRules.length} active)`);

    // Check for rules pointing to inactive/missing stations
    for (const rule of activeRules) {
      const station = result.stations.find((s) => s.id === rule.stationId);
      if (!station) {
        diagnosis.push(`FAIL: Active rule "${rule.ruleName ?? rule.ruleType}" points to missing station ${rule.stationId}`);
      } else if (!station.isActive) {
        diagnosis.push(`WARN: Active rule "${rule.ruleName ?? rule.ruleType}" points to disabled station "${station.displayName}"`);
      }
    }

    // 4. If catalogItemId provided, trace the full routing path
    if (input.catalogItemId) {
      // Get catalog item + hierarchy
      const itemRows = await tx.execute(
        sql`SELECT ci.id, ci.name, ci.category_id,
                   c1.name AS category_name,
                   c1.parent_id AS sub_department_id,
                   c1p.name AS sub_department_name,
                   c2.parent_id AS department_id,
                   c2p.name AS department_name
            FROM catalog_items ci
            LEFT JOIN catalog_categories c1 ON c1.id = ci.category_id
            LEFT JOIN catalog_categories c1p ON c1p.id = c1.parent_id
            LEFT JOIN catalog_categories c2 ON c2.id = c1.parent_id
            LEFT JOIN catalog_categories c2p ON c2p.id = c2.parent_id
            WHERE ci.id = ${input.catalogItemId} AND ci.tenant_id = ${input.tenantId}
            LIMIT 1`,
      );
      const item = Array.from(itemRows as Iterable<Record<string, unknown>>)[0];
      if (!item) {
        diagnosis.push(`FAIL: Catalog item ${input.catalogItemId} not found`);
      } else {
        result.catalogItem = {
          id: item.id as string,
          name: (item.name as string) ?? null,
          categoryId: (item.category_id as string) ?? null,
          categoryName: (item.category_name as string) ?? null,
          subDepartmentId: (item.sub_department_id as string) ?? null,
          subDepartmentName: (item.sub_department_name as string) ?? null,
          departmentId: (item.department_id as string) ?? null,
          departmentName: (item.department_name as string) ?? null,
        };

        const hier = result.catalogItem;
        diagnosis.push(
          `OK: Item "${hier.name}" hierarchy: ` +
          `Department="${hier.departmentName ?? 'NULL'}" (${hier.departmentId ?? 'null'}) → ` +
          `Sub-Department="${hier.subDepartmentName ?? 'NULL'}" (${hier.subDepartmentId ?? 'null'}) → ` +
          `Category="${hier.categoryName ?? 'NULL'}" (${hier.categoryId ?? 'null'})`,
        );

        if (!hier.departmentId && !hier.subDepartmentId && !hier.categoryId) {
          diagnosis.push('FAIL: Item has no category hierarchy — cannot match department/category routing rules');
        }

        // Check if any active rules match this item's hierarchy
        const matchingRules: string[] = [];
        for (const rule of activeRules) {
          if (rule.ruleType === 'item' && rule.catalogItemId === hier.id) {
            matchingRules.push(`Item rule "${rule.ruleName}" → ${rule.stationName}`);
          }
          if (rule.ruleType === 'category' && rule.categoryId === hier.categoryId) {
            matchingRules.push(`Category rule "${rule.ruleName}" → ${rule.stationName}`);
          }
          if (rule.ruleType === 'sub_department' && rule.subDepartmentId === hier.subDepartmentId) {
            matchingRules.push(`Sub-dept rule "${rule.ruleName}" → ${rule.stationName}`);
          }
          if (rule.ruleType === 'department' && rule.departmentId === hier.departmentId) {
            matchingRules.push(`Department rule "${rule.ruleName}" → ${rule.stationName} (matches departmentId)`);
          }
          // Cross-level: department rule matching subDepartmentId
          if (rule.ruleType === 'department' && rule.departmentId === hier.subDepartmentId) {
            matchingRules.push(`Department rule "${rule.ruleName}" → ${rule.stationName} (cross-matches subDepartmentId)`);
          }
        }
        if (matchingRules.length > 0) {
          diagnosis.push(`OK: ${matchingRules.length} active rule(s) could match this item:`);
          for (const m of matchingRules) {
            diagnosis.push(`  → ${m}`);
          }
        } else {
          diagnosis.push('WARN: No active rules match this item — routing will use FALLBACK station');
        }

        // Now run the ACTUAL routing engine to confirm
        const routableItem: RoutableItem = {
          orderLineId: 'diag-test',
          catalogItemId: input.catalogItemId,
        };
        const [enriched] = await enrichRoutableItems(input.tenantId, [routableItem]);
        result.enrichedItem = enriched ?? null;

        if (enriched) {
          diagnosis.push(
            `OK: Enriched item: categoryId=${enriched.categoryId ?? 'null'}, ` +
            `subDeptId=${enriched.subDepartmentId ?? 'null'}, deptId=${enriched.departmentId ?? 'null'}`,
          );
        }

        // Run actual routing
        try {
          const [routingResult] = await resolveStationRouting(
            {
              tenantId: input.tenantId,
              locationId: input.locationId,
              orderType: input.orderType,
              channel: input.channel ?? 'pos',
            },
            [enriched ?? routableItem],
          );
          result.routingResult = routingResult ?? null;

          if (routingResult?.stationId) {
            const station = result.stations.find((s) => s.id === routingResult.stationId);
            diagnosis.push(
              `OK: Routing resolved → Station "${station?.displayName ?? routingResult.stationId}" ` +
              `via ${routingResult.matchType ?? 'unknown'} match (rule: ${routingResult.routingRuleId ?? 'fallback'})`,
            );
          } else {
            diagnosis.push('FAIL: Routing engine returned NO station — item would be UNROUTED (no ticket created)');
          }
        } catch (err) {
          diagnosis.push(`FAIL: Routing engine threw: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // 5. Check for recent tickets at this location
    const ticketRows = await tx.execute(
      sql`SELECT kt.id, kt.ticket_number, kt.status, kt.station_id, kt.created_at,
                 ks.display_name AS station_name,
                 (SELECT count(*)::int FROM fnb_kitchen_ticket_items WHERE ticket_id = kt.id) AS item_count
          FROM fnb_kitchen_tickets kt
          LEFT JOIN fnb_kitchen_stations ks ON ks.id = kt.station_id
          WHERE kt.tenant_id = ${input.tenantId} AND kt.location_id = ${input.locationId}
          ORDER BY kt.created_at DESC
          LIMIT 10`,
    );
    result.recentTickets = Array.from(ticketRows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      ticketNumber: Number(r.ticket_number),
      status: r.status as string,
      stationId: (r.station_id as string) ?? null,
      stationName: (r.station_name as string) ?? null,
      createdAt: String(r.created_at),
      itemCount: Number(r.item_count ?? 0),
    }));

    if (result.recentTickets.length === 0) {
      diagnosis.push('WARN: No kitchen tickets found at this location — consumer may be silently failing');
    } else {
      diagnosis.push(`OK: ${result.recentTickets.length} recent ticket(s) found (latest: #${result.recentTickets[0]!.ticketNumber}, status=${result.recentTickets[0]!.status})`);
    }

    // 6. If tabId provided, check tab items
    if (input.tabId) {
      const tabItemRows = await tx.execute(
        sql`SELECT id, catalog_item_name, course_number, status, sub_department_id
            FROM fnb_tab_items
            WHERE tenant_id = ${input.tenantId} AND tab_id = ${input.tabId}
            ORDER BY course_number, sort_order`,
      );
      result.tabItems = Array.from(tabItemRows as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        catalogItemName: r.catalog_item_name as string,
        courseNumber: Number(r.course_number),
        status: r.status as string,
        subDepartmentId: (r.sub_department_id as string) ?? null,
      }));

      const draftItems = result.tabItems.filter((i) => i.status === 'draft');
      const sentItems = result.tabItems.filter((i) => i.status === 'sent');
      diagnosis.push(
        `OK: Tab has ${result.tabItems.length} item(s): ${draftItems.length} draft, ${sentItems.length} sent`,
      );

      // Check for orphaned drafts in sent courses
      const courseStatusRows = await tx.execute(
        sql`SELECT course_number, course_status FROM fnb_tab_courses
            WHERE tenant_id = ${input.tenantId} AND tab_id = ${input.tabId}`,
      );
      const courseStatuses = new Map<number, string>();
      for (const r of Array.from(courseStatusRows as Iterable<Record<string, unknown>>)) {
        courseStatuses.set(Number(r.course_number), r.course_status as string);
      }

      for (const item of draftItems) {
        const courseStatus = courseStatuses.get(item.courseNumber);
        if (courseStatus === 'sent' || courseStatus === 'fired') {
          diagnosis.push(
            `FAIL: Item "${item.catalogItemName}" is status=draft in Course ${item.courseNumber} ` +
            `which is already "${courseStatus}" — this item is ORPHANED and will never be sent`,
          );
        }
      }
    }
  });

  return result;
}

/** Parse a Postgres text[] value. */
function parseTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.length > 0);
  if (typeof value === 'string') {
    const trimmed = value.replace(/^\{|\}$/g, '');
    if (trimmed.length === 0) return [];
    return trimmed.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
  }
  return [];
}
