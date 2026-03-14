/**
 * KDS Course Dispatch — preparation layer + attempt tracking.
 *
 * This module provides:
 * - `prepareCourseDispatch()` — pre-transaction read-only work: load items,
 *   enrich catalog hierarchy, resolve routing, group by station, fetch prep times
 * - `recordDispatchAttempt()` — durable attempt tracking to fnb_kds_dispatch_attempts
 * - Shared types for dispatch results
 *
 * The actual atomic transaction (ticket creation + course marking) lives in
 * send-course.ts and resend-course-to-kds.ts. This module never writes
 * to tickets, courses, or tabs.
 */

import { eq, and, inArray, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { fnbTabs, fnbTabItems, fnbTabCourses, fnbTables } from '@oppsera/db';
import { logger } from '@oppsera/core/observability';
import { resolveStationRouting, enrichRoutableItems, resolveKdsLocationId, getStationPrepTimesForItems } from '../services/kds-routing-engine';
import type { RoutableItem, RoutingResult } from '../services/kds-routing-engine';
import type { RequestContext } from '@oppsera/core/auth/context';
import { normalizeBusinessDate } from '../helpers/normalize-business-date';

// ── Types ──────────────────────────────────────────────────────────

export type DispatchSource = 'fnb_course_send' | 'fnb_course_fire' | 'fnb_course_resend';
export type DispatchStatus = 'started' | 'routing_failed' | 'ticket_create_failed' | 'succeeded' | 'partial_commit_failed';

export interface DispatchCourseResult {
  attemptId: string | null;
  status: DispatchStatus;
  failureStage: string | null;
  ticketsCreated: number;
  ticketsFailed: number;
  itemsRouted: number;
  itemsUnrouted: number;
  itemCount: number;
  effectiveKdsLocationId: string | null;
  ticketIds: string[];
  stationIds: string[];
  orderId: string | null;
  tabType: string | null;
  businessDate: string | null;
  errors: string[];
  diagnosis: string[];
}

export function emptyDispatchResult(): DispatchCourseResult {
  return {
    attemptId: null,
    status: 'started',
    failureStage: null,
    ticketsCreated: 0,
    ticketsFailed: 0,
    itemsRouted: 0,
    itemsUnrouted: 0,
    itemCount: 0,
    effectiveKdsLocationId: null,
    ticketIds: [],
    stationIds: [],
    orderId: null,
    tabType: null,
    businessDate: null,
    errors: [],
    diagnosis: [],
  };
}

export interface PreparedTicketItem {
  orderLineId: string;
  catalogItemId: string;
  itemName: string;
  modifierSummary: string | null;
  specialInstructions: string | null;
  seatNumber: number | null;
  courseName: string;
  quantity: number;
  stationId: string;
  routingRuleId: string | null;
}

export interface PreparedDispatch {
  tab: {
    id: string;
    locationId: string | null;
    primaryOrderId: string | null;
    businessDate: string;
    tableId: string | null;
    tabType: string | null;
  };
  courseName: string;
  effectiveLocationId: string;
  tableNumber: number | null;
  stationGroups: Map<string, PreparedTicketItem[]>;
  stationNameMap: Map<string, string>;
  prepTimeMap: Map<string, number>; // orderLineId → seconds
  routingResults: RoutingResult[];
  diagnosis: string[];
  errors: string[];
  itemCount: number;
  itemsRouted: number;
  itemsUnrouted: number;
}

// ── Preparation (pre-transaction) ──────────────────────────────────

export async function prepareCourseDispatch(
  ctx: RequestContext,
  input: { tabId: string; courseNumber: number; locationId?: string },
): Promise<PreparedDispatch> {
  const diagnosis: string[] = [];
  const errors: string[] = [];

  // 1. Fetch tab + course name + items in a single connection.
  // Previously used Promise.all with 2 withTenant calls (= 2 pool
  // slots). Merged to 1 to reduce connection pressure (pool max:2).
  const { tabRaw, courseName, items } = await withTenant(ctx.tenantId, async (tx) => {
    const tabResult = await tx
      .select({
        id: fnbTabs.id,
        locationId: fnbTabs.locationId,
        primaryOrderId: fnbTabs.primaryOrderId,
        businessDate: fnbTabs.businessDate,
        tableId: fnbTabs.tableId,
        tabType: fnbTabs.tabType,
      })
      .from(fnbTabs)
      .where(and(eq(fnbTabs.id, input.tabId), eq(fnbTabs.tenantId, ctx.tenantId)))
      .limit(1);

    const courseResult = await tx
      .select({ courseName: fnbTabCourses.courseName })
      .from(fnbTabCourses)
      .where(
        and(
          eq(fnbTabCourses.tenantId, ctx.tenantId),
          eq(fnbTabCourses.tabId, input.tabId),
          eq(fnbTabCourses.courseNumber, input.courseNumber),
        ),
      )
      .limit(1);

    const itemResult = await tx
      .select({
        id: fnbTabItems.id,
        catalogItemId: fnbTabItems.catalogItemId,
        catalogItemName: fnbTabItems.catalogItemName,
        seatNumber: fnbTabItems.seatNumber,
        qty: fnbTabItems.qty,
        modifiers: fnbTabItems.modifiers,
        subDepartmentId: fnbTabItems.subDepartmentId,
        specialInstructions: fnbTabItems.specialInstructions,
      })
      .from(fnbTabItems)
      .where(
        and(
          eq(fnbTabItems.tenantId, ctx.tenantId),
          eq(fnbTabItems.tabId, input.tabId),
          eq(fnbTabItems.courseNumber, input.courseNumber),
          inArray(fnbTabItems.status, ['draft', 'sent', 'fired']),
        ),
      );

    // Diagnostic: if no items found, log what items actually exist for this tab
    if (itemResult.length === 0) {
      const allItems = await tx
        .select({
          id: fnbTabItems.id,
          courseNumber: fnbTabItems.courseNumber,
          status: fnbTabItems.status,
          catalogItemName: fnbTabItems.catalogItemName,
        })
        .from(fnbTabItems)
        .where(
          and(
            eq(fnbTabItems.tenantId, ctx.tenantId),
            eq(fnbTabItems.tabId, input.tabId),
          ),
        );
      logger.warn('[kds] prepareCourseDispatch: no items found — diagnostic dump', {
        domain: 'kds',
        tenantId: ctx.tenantId,
        tabId: input.tabId,
        requestedCourseNumber: input.courseNumber,
        totalItemsOnTab: allItems.length,
        itemsByCoursAndStatus: allItems.map((i) => ({
          id: i.id,
          course: i.courseNumber,
          status: i.status,
          name: i.catalogItemName,
        })),
      });
    }

    return {
      tabRaw: tabResult[0] ?? null,
      courseName: courseResult[0]?.courseName ?? `Course ${input.courseNumber}`,
      items: itemResult,
    };
  });

  // Early failures — return partial prep with errors
  const failPrep = (msg: string): PreparedDispatch => {
    errors.push(msg);
    return {
      tab: null!,
      courseName,
      effectiveLocationId: '',
      tableNumber: null,
      stationGroups: new Map(),
      stationNameMap: new Map(),
      prepTimeMap: new Map(),
      routingResults: [],
      diagnosis,
      errors,
      itemCount: items.length,
      itemsRouted: 0,
      itemsUnrouted: 0,
    };
  };

  if (!tabRaw) return failPrep(`Tab ${input.tabId} not found`);

  const tab = {
    ...tabRaw,
    businessDate: normalizeBusinessDate(tabRaw.businessDate),
  };

  const rawLocationId = input.locationId || ctx.locationId || tab.locationId;
  if (!rawLocationId) return failPrep('No locationId on context, event, or tab');

  // 2. Resolve effective KDS location (site↔venue hierarchy fallback)
  const effectiveLocationId = await resolveKdsLocationId(ctx.tenantId, rawLocationId);
  diagnosis.push(`Tab: rawLocationId=${rawLocationId}, resolvedLocationId=${effectiveLocationId}, tabType=${tab.tabType ?? 'null'}`);

  if (items.length === 0) {
    // No dispatchable items — return a valid prep with 0 items instead of failing.
    // This can happen when a course exists but all its items are voided/served.
    // Callers should treat 0-item prep as a no-op (mark course as sent, no tickets needed).
    diagnosis.push(`No dispatchable items for Course ${input.courseNumber} (all voided/served or none exist)`);
    return {
      tab,
      courseName,
      effectiveLocationId,
      tableNumber: null,
      stationGroups: new Map(),
      stationNameMap: new Map(),
      prepTimeMap: new Map(),
      routingResults: [],
      diagnosis,
      errors: [],
      itemCount: 0,
      itemsRouted: 0,
      itemsUnrouted: 0,
    };
  }
  diagnosis.push(`Found ${items.length} item(s) in Course ${input.courseNumber}`);

  // 3. Resolve table number (for KDS ticket display)
  let tableNumber: number | null = null;
  if (tab.tableId) {
    try {
      const [tableRow] = await withTenant(ctx.tenantId, (tx) =>
        tx.select({ tableNumber: fnbTables.tableNumber }).from(fnbTables).where(eq(fnbTables.id, tab.tableId!)).limit(1),
      );
      tableNumber = tableRow?.tableNumber ?? null;
    } catch {
      // Non-critical
    }
  }

  // 4. Build routable items + enrich
  let routableItems: RoutableItem[] = items.map((item) => ({
    orderLineId: item.id,
    catalogItemId: item.catalogItemId,
    subDepartmentId: item.subDepartmentId ?? null,
    modifierIds: extractModifierIds(item.modifiers),
  }));

  routableItems = await enrichRoutableItems(ctx.tenantId, routableItems);

  // 5. Resolve routing
  const routingResults = await resolveStationRouting(
    { tenantId: ctx.tenantId, locationId: effectiveLocationId, orderType: tab.tabType ?? undefined, channel: 'pos' },
    routableItems,
  );

  let itemsRouted = 0;
  let itemsUnrouted = 0;
  for (const rr of routingResults) {
    if (rr.stationId) {
      itemsRouted++;
    } else {
      itemsUnrouted++;
      const itemName = items.find((i) => i.id === rr.orderLineId)?.catalogItemName ?? rr.orderLineId;
      diagnosis.push(`UNROUTED: "${itemName}" — no station matched`);
    }
  }

  // 6. Group routed items by station
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const routingMap = new Map(routingResults.map((r) => [r.orderLineId, r]));
  const stationGroups = new Map<string, PreparedTicketItem[]>();

  for (const r of routingResults) {
    if (!r.stationId) continue;
    const item = itemMap.get(r.orderLineId);
    if (!item) continue;

    const group = stationGroups.get(r.stationId) ?? [];
    group.push({
      orderLineId: item.id,
      catalogItemId: item.catalogItemId,
      itemName: item.catalogItemName,
      modifierSummary: formatModifierSummary(item.modifiers),
      specialInstructions: item.specialInstructions ?? null,
      seatNumber: item.seatNumber ?? null,
      courseName,
      quantity: Number(item.qty) || 1,
      stationId: r.stationId,
      routingRuleId: r.routingRuleId,
    });
    stationGroups.set(r.stationId, group);
  }

  if (stationGroups.size === 0) return failPrep('No stations resolved — no tickets will be created');

  diagnosis.push(`Grouped into ${stationGroups.size} station(s)`);

  // 7. Pre-fetch station names (cosmetic, non-critical)
  const stationNameMap = new Map<string, string>();
  try {
    const stationIds = Array.from(stationGroups.keys());
    const stationNameRows = await withTenant(ctx.tenantId, (tx) =>
      tx.execute(sql`
        SELECT id, display_name FROM fnb_kitchen_stations
        WHERE tenant_id = ${ctx.tenantId} AND id IN (${sql.join(stationIds.map((id) => sql`${id}`), sql`, `)})
      `),
    );
    for (const row of Array.from(stationNameRows as Iterable<Record<string, unknown>>)) {
      stationNameMap.set(row.id as string, (row.display_name as string) ?? 'Unknown');
    }
  } catch {
    // Non-critical
  }

  // 8. Pre-fetch prep times
  const prepTimeLookups: Array<{ orderLineId: string; catalogItemId: string; stationId: string }> = [];
  for (const item of items) {
    const routing = routingMap.get(item.id);
    if (routing?.stationId && item.catalogItemId) {
      prepTimeLookups.push({ orderLineId: item.id, catalogItemId: item.catalogItemId, stationId: routing.stationId });
    }
  }
  const prepTimeMap = await getStationPrepTimesForItems(ctx.tenantId, prepTimeLookups);

  return {
    tab,
    courseName,
    effectiveLocationId,
    tableNumber,
    stationGroups,
    stationNameMap,
    prepTimeMap,
    routingResults,
    diagnosis,
    errors,
    itemCount: items.length,
    itemsRouted,
    itemsUnrouted,
  };
}

// ── Attempt tracking ───────────────────────────────────────────────

export async function recordDispatchAttempt(
  tenantId: string,
  input: { tabId: string; courseNumber: number; source: DispatchSource; locationId?: string; priorAttemptId?: string },
  result: DispatchCourseResult,
  startMs: number,
): Promise<string | null> {
  try {
    const durationMs = Date.now() - startMs;
    const rows = await withTenant(tenantId, (tx) =>
      tx.execute(sql`
        INSERT INTO fnb_kds_dispatch_attempts (
          id, tenant_id, location_id, tab_id, order_id, course_number,
          effective_kds_location_id, order_type, channel, source, status,
          failure_stage, ticket_count, tickets_created, stations_resolved,
          items_routed, items_unrouted, item_count,
          diagnosis, errors, prior_attempt_id, business_date, duration_ms,
          created_at, updated_at
        ) VALUES (
          gen_ulid(), ${tenantId},
          ${result.effectiveKdsLocationId ?? input.locationId ?? ''},
          ${input.tabId}, ${result.orderId},
          ${input.courseNumber},
          ${result.effectiveKdsLocationId},
          ${result.tabType}, ${'pos'},
          ${input.source}, ${result.status},
          ${result.failureStage},
          ${result.ticketsCreated},
          ${JSON.stringify(result.ticketIds)}::jsonb,
          ${JSON.stringify(result.stationIds)}::jsonb,
          ${result.itemsRouted}, ${result.itemsUnrouted}, ${result.itemCount},
          ${JSON.stringify(result.diagnosis)}::jsonb,
          ${JSON.stringify(result.errors)}::jsonb,
          ${input.priorAttemptId ?? null},
          ${result.businessDate},
          ${durationMs},
          NOW(), NOW()
        )
        RETURNING id
      `),
    );
    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    const attemptId = row ? (row.id as string) : null;
    if (attemptId) result.attemptId = attemptId;
    return attemptId;
  } catch (err) {
    logger.warn('[kds] dispatch: attempt tracking failed', {
      domain: 'kds', tenantId, tabId: input.tabId,
      courseNumber: input.courseNumber,
      error: { message: err instanceof Error ? err.message : String(err) },
    });
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────

export function extractModifierIds(modifiers: unknown): string[] {
  if (!Array.isArray(modifiers)) return [];
  const ids: string[] = [];
  for (const mod of modifiers) {
    if (typeof mod === 'object' && mod !== null) {
      const m = mod as Record<string, unknown>;
      const id = m.modifierId as string | undefined;
      if (id) ids.push(id);
    }
  }
  return ids;
}

export function formatModifierSummary(modifiers: unknown): string | null {
  if (!Array.isArray(modifiers) || modifiers.length === 0) return null;
  const parts: string[] = [];
  for (const mod of modifiers) {
    if (typeof mod === 'object' && mod !== null) {
      const m = mod as Record<string, unknown>;
      const name = String(m.name ?? m.modifierName ?? m.label ?? '');
      if (name) parts.push(name);
    } else if (typeof mod === 'string') {
      parts.push(mod);
    }
  }
  return parts.length > 0 ? parts.join(', ') : null;
}
