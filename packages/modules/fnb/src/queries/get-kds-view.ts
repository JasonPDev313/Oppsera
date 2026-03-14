import { sql, eq, and, inArray } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { fnbKitchenStations, fnbTabCourses, fnbTabItems, fnbTabs, fnbTables } from '@oppsera/db';
import { logger } from '@oppsera/core/observability';
import type { GetKdsViewInput } from '../validation';
import { StationNotFoundError, ExpoStationError } from '../errors';

/** Clamp to non-negative — guards against clock drift where NOW() < sent_at. */
function clampNonNeg(n: number): number {
  return n > 0 ? n : 0;
}

/** Safe numeric conversion: undefined/null/NaN → fallback (default 0). */
function safeNum(v: unknown, fallback = 0): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ── Rate-limited warning logger ────────────────────────────────────
// Tier 2 enrichment failures are polled every 5s per tablet. Without
// suppression, a broken query floods logs at (tablets × 12/min). We
// suppress duplicate warnings per (station + enrichment key) for 60s.
export const _warnedAt = new Map<string, number>();
const WARN_SUPPRESS_MS = 60_000;

function warnOnce(key: string, message: string, meta: Record<string, unknown>): void {
  const now = Date.now();
  const last = _warnedAt.get(key) ?? 0;
  if (now - last < WARN_SUPPRESS_MS) return;
  _warnedAt.set(key, now);
  logger.warn(message, meta);
}

/** Group items by courseName and compute per-course readiness. */
export function buildCourseGroups(items: KdsTicketItem[]): KdsCourseGroup[] {
  const byCourseName = new Map<string, KdsTicketItem[]>();
  for (const item of items) {
    if (!item.courseName) continue;
    const arr = byCourseName.get(item.courseName) ?? [];
    arr.push(item);
    byCourseName.set(item.courseName, arr);
  }
  const groups: KdsCourseGroup[] = [];
  for (const [courseName, courseItems] of byCourseName) {
    const readyCount = courseItems.filter((i) => i.itemStatus === 'ready' || i.itemStatus === 'served').length;
    groups.push({
      courseName,
      itemCount: courseItems.length,
      readyCount,
      allReady: readyCount === courseItems.length,
    });
  }
  return groups;
}

export interface KdsTicketItem {
  itemId: string;
  orderLineId: string;
  itemName: string;
  kitchenLabel: string | null;
  itemColor: string | null;
  modifierSummary: string | null;
  specialInstructions: string | null;
  seatNumber: number | null;
  courseName: string | null;
  quantity: number;
  itemStatus: string;
  priorityLevel: number;
  estimatedPrepSeconds: number | null;
  routingRuleId: string | null;
  stationId: string | null;
  isRush: boolean;
  isAllergy: boolean;
  isVip: boolean;
  startedAt: string | null;
  readyAt: string | null;
  bumpedBy: string | null;
  elapsedSeconds: number;
}

export interface KdsCourseGroup {
  courseName: string;
  /** Count of items in this course at this station */
  itemCount: number;
  /** Count of ready items in this course */
  readyCount: number;
  /** True when all items in this course are ready */
  allReady: boolean;
}

export interface KdsTicketCard {
  ticketId: string;
  ticketNumber: number;
  tabId: string;
  courseNumber: number | null;
  /** Course name from tab courses or course definitions */
  courseName: string | null;
  status: string;
  priorityLevel: number;
  isHeld: boolean;
  orderType: string | null;
  channel: string | null;
  tableNumber: number | null;
  serverName: string | null;
  customerName: string | null;
  sentAt: string;
  estimatedPickupAt: string | null;
  elapsedSeconds: number;
  items: KdsTicketItem[];
  otherStations: { stationId: string; stationName: string }[];
  /** Order source from orders table — pos, online, kiosk, delivery */
  orderSource: string | null;
  /** Terminal/POS station ID from orders table */
  terminalId: string | null;
  /** Human-friendly terminal name (e.g., "Bar POS 1") */
  terminalName: string | null;
  /** ISO datetime when order was placed */
  orderTimestamp: string | null;
  /** Business date (YYYY-MM-DD) — stale if < today */
  businessDate: string | null;
  /** Count of active items at THIS station (excludes served/voided) */
  stationItemCount: number;
  /** Count of ready items at THIS station */
  stationReadyCount: number;
  /** Alert level based on elapsed time vs station thresholds: 'normal' | 'warning' | 'critical' */
  alertLevel: 'normal' | 'warning' | 'critical';
  /** Items grouped by course — only populated when items have courseName */
  courseGroups: KdsCourseGroup[];
  /** Total active items across ALL stations for this order/tab */
  totalOrderItems: number;
  /** Total ready items across ALL stations for this order/tab */
  totalOrderReadyItems: number;
}

export interface KdsCompletedTicket {
  ticketId: string;
  ticketNumber: number;
  tableNumber: number | null;
  serverName: string | null;
  itemCount: number;
  completedAt: string;
  completedSecondsAgo: number;
}

export interface KdsUpcomingCourse {
  tabId: string;
  courseNumber: number;
  courseName: string | null;
  courseStatus: string;
  itemCount: number;
  tableNumber: number | null;
}

export interface KdsView {
  stationId: string;
  stationName: string;
  stationType: string;
  stationColor: string | null;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  rushMode: boolean;
  tickets: KdsTicketCard[];
  activeTicketCount: number;
  recentlyCompleted: KdsCompletedTicket[];
  /** Count of tickets served/ready today at this station */
  servedTodayCount: number;
  /** Upcoming courses (held/unsent) for tabs with active tickets */
  upcomingCourses: KdsUpcomingCourse[];
}

// ── Tier 2 helpers ─────────────────────────────────────────────────
// Each runs in its own withTenant (separate Postgres transaction) so a
// failure in any enrichment query cannot poison the core ticket data.

interface CrossStationData {
  stationsByTicket: Map<string, { stationId: string; stationName: string }[]>;
  progressByTicket: Map<string, { total: number; ready: number }>;
}

async function fetchCrossStationData(
  tenantId: string,
  stationId: string,
  ticketIds: string[],
): Promise<CrossStationData> {
  return withTenant(tenantId, async (tx) => {
    // "Also At" — which other stations have items for the same order
    const otherStationRows = await tx.execute(
      sql`SELECT DISTINCT kt_this.id AS ticket_id,
                 kti_other.station_id, ks.display_name AS station_name
          FROM fnb_kitchen_tickets kt_this
          INNER JOIN fnb_kitchen_tickets kt_sibling
            ON kt_sibling.tenant_id = kt_this.tenant_id
            AND kt_sibling.location_id = kt_this.location_id
            AND kt_sibling.business_date = kt_this.business_date
            AND kt_sibling.id != kt_this.id
            AND kt_sibling.status NOT IN ('voided', 'served')
            AND (
              (kt_sibling.order_id IS NOT NULL AND kt_sibling.order_id = kt_this.order_id)
              OR (kt_sibling.tab_id IS NOT NULL AND kt_sibling.tab_id = kt_this.tab_id)
            )
          INNER JOIN fnb_kitchen_ticket_items kti_other
            ON kti_other.ticket_id = kt_sibling.id
            AND kti_other.station_id != ${stationId}
            AND kti_other.item_status NOT IN ('served', 'voided')
          INNER JOIN fnb_kitchen_stations ks
            ON ks.id = kti_other.station_id AND ks.tenant_id = ${tenantId}
          WHERE kt_this.id IN (${sql.join(ticketIds.map((id) => sql`${id}`), sql`, `)})`,
    );
    const stationsByTicket = new Map<string, { stationId: string; stationName: string }[]>();
    for (const row of Array.from(otherStationRows as Iterable<Record<string, unknown>>)) {
      const tid = row.ticket_id as string;
      if (!stationsByTicket.has(tid)) stationsByTicket.set(tid, []);
      const existing = stationsByTicket.get(tid)!;
      if (!existing.some((s) => s.stationId === (row.station_id as string))) {
        existing.push({
          stationId: row.station_id as string,
          stationName: (row.station_name as string) ?? 'Unknown',
        });
      }
    }

    // Cross-station order progress: total/ready items across ALL stations
    const progressRows = await tx.execute(
      sql`SELECT kt_this.id AS ticket_id,
                 COUNT(kti_all.id)::integer AS total_order_items,
                 COUNT(kti_all.id) FILTER (WHERE kti_all.item_status IN ('ready', 'served'))::integer AS ready_order_items
          FROM fnb_kitchen_tickets kt_this
          INNER JOIN fnb_kitchen_tickets kt_related
            ON kt_related.tenant_id = kt_this.tenant_id
            AND kt_related.location_id = kt_this.location_id
            AND kt_related.status NOT IN ('voided')
            AND (
              (kt_related.order_id IS NOT NULL AND kt_related.order_id = kt_this.order_id)
              OR (kt_related.tab_id IS NOT NULL AND kt_related.tab_id = kt_this.tab_id)
            )
          INNER JOIN fnb_kitchen_ticket_items kti_all
            ON kti_all.ticket_id = kt_related.id
            AND kti_all.item_status != 'voided'
          WHERE kt_this.id IN (${sql.join(ticketIds.map((id) => sql`${id}`), sql`, `)})
          GROUP BY kt_this.id`,
    );
    const progressByTicket = new Map<string, { total: number; ready: number }>();
    for (const row of Array.from(progressRows as Iterable<Record<string, unknown>>)) {
      progressByTicket.set(row.ticket_id as string, {
        total: safeNum(row.total_order_items),
        ready: safeNum(row.ready_order_items),
      });
    }

    return { stationsByTicket, progressByTicket };
  });
}

async function fetchRecentlyCompleted(
  tenantId: string,
  locationId: string,
  stationId: string,
  businessDate: string,
): Promise<KdsCompletedTicket[]> {
  return withTenant(tenantId, async (tx) => {
    const completedRows = await tx.execute(
      sql`SELECT kt.id, kt.ticket_number, kt.table_number, kt.server_name,
                 COUNT(kti.id)::integer AS item_count,
                 COALESCE(MAX(kti.served_at), MAX(kti.ready_at)) AS completed_at,
                 EXTRACT(EPOCH FROM (NOW() - COALESCE(MAX(kti.served_at), MAX(kti.ready_at))))::integer AS completed_seconds_ago
          FROM fnb_kitchen_tickets kt
          INNER JOIN fnb_kitchen_ticket_items kti
            ON kti.ticket_id = kt.id AND kti.station_id = ${stationId}
          WHERE kt.tenant_id = ${tenantId}
            AND kt.location_id = ${locationId}
            AND kt.business_date = ${businessDate}
            AND kti.item_status IN ('ready', 'served')
            AND NOT EXISTS (
              SELECT 1 FROM fnb_kitchen_ticket_items kti2
              WHERE kti2.ticket_id = kt.id
                AND kti2.station_id = ${stationId}
                AND kti2.item_status NOT IN ('ready', 'served', 'voided')
            )
          GROUP BY kt.id
          ORDER BY COALESCE(MAX(kti.served_at), MAX(kti.ready_at)) DESC NULLS LAST
          LIMIT 20`,
    );
    return Array.from(completedRows as Iterable<Record<string, unknown>>).map((r) => ({
      ticketId: r.id as string,
      ticketNumber: safeNum(r.ticket_number),
      tableNumber: r.table_number != null ? safeNum(r.table_number) : null,
      serverName: (r.server_name as string) ?? null,
      itemCount: safeNum(r.item_count),
      completedAt: (r.completed_at as string) ?? '',
      completedSecondsAgo: clampNonNeg(safeNum(r.completed_seconds_ago)),
    }));
  });
}

async function fetchServedTodayCount(
  tenantId: string,
  locationId: string,
  stationId: string,
  businessDate: string,
): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const servedCountRows = await tx.execute(
      sql`SELECT COUNT(DISTINCT kt.id)::integer AS served_count
          FROM fnb_kitchen_tickets kt
          WHERE kt.tenant_id = ${tenantId}
            AND kt.location_id = ${locationId}
            AND kt.business_date = ${businessDate}
            AND kt.status IN ('served', 'ready')
            AND EXISTS (
              SELECT 1 FROM fnb_kitchen_ticket_items kti
              WHERE kti.ticket_id = kt.id AND kti.station_id = ${stationId}
            )`,
    );
    return safeNum(
      (Array.from(servedCountRows as Iterable<Record<string, unknown>>)[0]?.served_count),
    );
  });
}

async function fetchUpcomingCourses(
  tenantId: string,
  activeTabIds: string[],
): Promise<KdsUpcomingCourse[]> {
  const courseRows = await withTenant(tenantId, (tx) =>
    tx
      .select({
        tabId: fnbTabCourses.tabId,
        courseNumber: fnbTabCourses.courseNumber,
        courseName: fnbTabCourses.courseName,
        courseStatus: fnbTabCourses.courseStatus,
        tableNumber: fnbTables.tableNumber,
        itemCount:
          sql<number>`(SELECT COUNT(*)::integer FROM ${fnbTabItems}
            WHERE ${fnbTabItems.tabId} = ${fnbTabCourses.tabId}
              AND ${fnbTabItems.courseNumber} = ${fnbTabCourses.courseNumber}
              AND ${fnbTabItems.tenantId} = ${fnbTabCourses.tenantId}
              AND ${fnbTabItems.status} != 'voided')`.as('item_count'),
      })
      .from(fnbTabCourses)
      .leftJoin(
        fnbTabs,
        and(
          eq(fnbTabs.id, fnbTabCourses.tabId),
          eq(fnbTabs.tenantId, fnbTabCourses.tenantId),
        ),
      )
      .leftJoin(
        fnbTables,
        and(
          eq(fnbTables.id, fnbTabs.tableId),
          eq(fnbTables.tenantId, fnbTabs.tenantId),
        ),
      )
      .where(
        and(
          eq(fnbTabCourses.tenantId, tenantId),
          inArray(fnbTabCourses.courseStatus, ['unsent', 'sent', 'held']),
          inArray(fnbTabCourses.tabId, activeTabIds),
        ),
      )
      .orderBy(fnbTabCourses.tabId, fnbTabCourses.courseNumber),
  );
  return courseRows.map((r) => ({
    tabId: r.tabId,
    courseNumber: r.courseNumber,
    courseName: r.courseName ?? null,
    courseStatus: r.courseStatus,
    itemCount: safeNum(r.itemCount),
    tableNumber: r.tableNumber != null ? safeNum(r.tableNumber) : null,
  }));
}

// ── Diagnostic log (no DB round-trip) ──────────────────────────────
// When no active tickets are found, log the input params so operators
// can correlate with the DB if needed. No transaction, no failure risk.

function logEmptyView(input: GetKdsViewInput, resolvedLocationId: string): void {
  logger.debug('[KDS] Empty view — no active tickets for station', {
    domain: 'kds',
    tenantId: input.tenantId,
    stationId: input.stationId,
    locationId: resolvedLocationId,
    businessDate: input.businessDate,
  });
}

// ── Main query ─────────────────────────────────────────────────────

export async function getKdsView(
  input: GetKdsViewInput,
): Promise<KdsView> {
  // ── Tier 1: core ticket data (must succeed or KDS is dark) ──
  if (!input.locationId) {
    throw new StationNotFoundError(input.stationId);
  }
  const resolvedLocationId = input.locationId;

  const coreData = await withTenant(input.tenantId, async (tx) => {
    const stationArr = await tx
      .select({
        id: fnbKitchenStations.id,
        name: fnbKitchenStations.name,
        displayName: fnbKitchenStations.displayName,
        stationType: fnbKitchenStations.stationType,
        color: fnbKitchenStations.color,
        warningThresholdSeconds: fnbKitchenStations.warningThresholdSeconds,
        criticalThresholdSeconds: fnbKitchenStations.criticalThresholdSeconds,
        rushMode: fnbKitchenStations.rushMode,
        locationId: fnbKitchenStations.locationId,
      })
      .from(fnbKitchenStations)
      .where(
        and(
          eq(fnbKitchenStations.id, input.stationId),
          eq(fnbKitchenStations.tenantId, input.tenantId),
          eq(fnbKitchenStations.locationId, resolvedLocationId),
        ),
      )
      .limit(1);
    const station = stationArr[0];
    if (!station) throw new StationNotFoundError(input.stationId);
    if (station.stationType === 'expo') throw new ExpoStationError(input.stationId);

    // Active tickets with items at this station.
    // No business_date filter — tickets persist until bumped or voided.
    const ticketRows = await tx.execute(
      sql`SELECT DISTINCT kt.id, kt.ticket_number, kt.tab_id, kt.course_number,
                 kt.status, kt.priority_level, kt.is_held, kt.order_type,
                 kt.channel, kt.table_number, kt.server_name, kt.customer_name,
                 kt.sent_at, kt.estimated_pickup_at, kt.business_date,
                 EXTRACT(EPOCH FROM (NOW() - kt.sent_at))::integer AS elapsed_seconds,
                 o.source AS order_source, o.terminal_id, o.created_at AS order_timestamp,
                 t.title AS terminal_name,
                 COALESCE(tc.course_name, cd.course_name) AS course_name
          FROM fnb_kitchen_tickets kt
          INNER JOIN fnb_kitchen_ticket_items kti
            ON kti.ticket_id = kt.id AND kti.station_id = ${input.stationId}
          LEFT JOIN orders o
            ON o.id = kt.order_id AND o.tenant_id = kt.tenant_id
          LEFT JOIN terminals t
            ON t.id = o.terminal_id AND t.tenant_id = kt.tenant_id
          LEFT JOIN fnb_tab_courses tc
            ON tc.tab_id = kt.tab_id AND tc.course_number = kt.course_number AND tc.tenant_id = kt.tenant_id
          LEFT JOIN fnb_course_definitions cd
            ON cd.tenant_id = kt.tenant_id AND cd.location_id = kt.location_id
            AND cd.course_number = kt.course_number AND cd.is_active = true
          WHERE kt.tenant_id = ${input.tenantId}
            AND kt.location_id = ${resolvedLocationId}
            AND kt.status IN ('pending', 'in_progress')
            AND kti.item_status NOT IN ('served', 'voided')
          ORDER BY kt.priority_level DESC NULLS LAST, kt.sent_at ASC
          LIMIT 200`,
    );
    const tickets = Array.from(ticketRows as Iterable<Record<string, unknown>>);

    // Batch-fetch all items for active tickets at this station (single query, no N+1)
    const ticketIds = tickets.map((t) => t.id as string);
    const itemsByTicket = new Map<string, KdsTicketItem[]>();

    if (ticketIds.length > 0) {
      const allItemRows = await tx.execute(
        sql`SELECT ticket_id, id, order_line_id, item_name, kitchen_label, item_color,
                   modifier_summary, special_instructions,
                   seat_number, course_name, quantity, item_status, station_id,
                   priority_level, estimated_prep_seconds, routing_rule_id,
                   is_rush, is_allergy, is_vip,
                   started_at, ready_at, bumped_by,
                   EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, created_at)))::integer AS elapsed_seconds
            FROM fnb_kitchen_ticket_items
            WHERE ticket_id IN (${sql.join(ticketIds.map((id) => sql`${id}`), sql`, `)})
              AND station_id = ${input.stationId}
              AND item_status NOT IN ('served', 'voided')
            ORDER BY ticket_id, priority_level DESC NULLS LAST, seat_number NULLS LAST, id ASC`,
      );
      for (const r of Array.from(allItemRows as Iterable<Record<string, unknown>>)) {
        const tid = r.ticket_id as string;
        const item: KdsTicketItem = {
          itemId: r.id as string,
          orderLineId: r.order_line_id as string,
          itemName: (r.item_name as string) ?? 'Unknown Item',
          kitchenLabel: (r.kitchen_label as string) ?? null,
          itemColor: (r.item_color as string) ?? null,
          modifierSummary: (r.modifier_summary as string) ?? null,
          specialInstructions: (r.special_instructions as string) ?? null,
          seatNumber: r.seat_number != null ? safeNum(r.seat_number) : null,
          courseName: (r.course_name as string) ?? null,
          quantity: safeNum(r.quantity, 1),
          itemStatus: (r.item_status as string) ?? 'pending',
          priorityLevel: safeNum(r.priority_level),
          estimatedPrepSeconds: r.estimated_prep_seconds != null ? safeNum(r.estimated_prep_seconds) : null,
          routingRuleId: (r.routing_rule_id as string) ?? null,
          stationId: (r.station_id as string) ?? null,
          isRush: !!r.is_rush,
          isAllergy: !!r.is_allergy,
          isVip: !!r.is_vip,
          startedAt: (r.started_at as string) ?? null,
          readyAt: (r.ready_at as string) ?? null,
          bumpedBy: (r.bumped_by as string) ?? null,
          elapsedSeconds: clampNonNeg(safeNum(r.elapsed_seconds)),
        };
        if (!itemsByTicket.has(tid)) itemsByTicket.set(tid, []);
        itemsByTicket.get(tid)!.push(item);
      }
    }

    const warnThreshold = station.warningThresholdSeconds;
    const critThreshold = station.criticalThresholdSeconds;

    const ticketCards: KdsTicketCard[] = tickets.map((t) => {
      const items = itemsByTicket.get(t.id as string) ?? [];
      const elapsed = clampNonNeg(safeNum(t.elapsed_seconds));
      const alertLevel: 'normal' | 'warning' | 'critical' =
        elapsed >= critThreshold ? 'critical' :
        elapsed >= warnThreshold ? 'warning' : 'normal';
      return {
        ticketId: t.id as string,
        ticketNumber: safeNum(t.ticket_number),
        tabId: (t.tab_id as string) ?? '',
        courseNumber: t.course_number != null ? safeNum(t.course_number) : null,
        courseName: (t.course_name as string) ?? null,
        status: (t.status as string) ?? 'pending',
        priorityLevel: safeNum(t.priority_level),
        isHeld: !!t.is_held,
        orderType: (t.order_type as string) ?? null,
        channel: (t.channel as string) ?? null,
        tableNumber: t.table_number != null ? safeNum(t.table_number) : null,
        serverName: (t.server_name as string) ?? null,
        customerName: (t.customer_name as string) ?? null,
        sentAt: (t.sent_at as string) ?? new Date().toISOString(),
        estimatedPickupAt: (t.estimated_pickup_at as string) ?? null,
        elapsedSeconds: elapsed,
        items,
        otherStations: [],
        orderSource: (t.order_source as string) ?? null,
        terminalId: (t.terminal_id as string) ?? null,
        terminalName: (t.terminal_name as string) ?? null,
        orderTimestamp: (t.order_timestamp as string) ?? null,
        businessDate: (t.business_date as string) ?? null,
        stationItemCount: items.length,
        stationReadyCount: items.filter((i) => i.itemStatus === 'ready').length,
        alertLevel,
        courseGroups: buildCourseGroups(items),
        totalOrderItems: items.length,
        totalOrderReadyItems: items.filter((i) => i.itemStatus === 'ready').length,
      };
    });

    return {
      station,
      ticketCards,
      activeTabIds: [...new Set(ticketCards.map((c) => c.tabId).filter(Boolean))],
    };
  });

  // Log empty views for debugging — no DB hit, just params
  if (coreData.ticketCards.length === 0) {
    logEmptyView(input, resolvedLocationId);
  }

  // ── Tier 2: enrichment queries (best-effort, parallel, isolated) ──
  // Each helper runs in its own withTenant (separate Postgres transaction).
  // Promise.allSettled ensures a failure in any one cannot affect the others
  // or the core ticket data above.

  const ticketIds = coreData.ticketCards.map((c) => c.ticketId);
  const hasTickets = ticketIds.length > 0;
  const hasActiveTabs = coreData.activeTabIds.length > 0;

  const [crossStationResult, completedResult, servedResult, coursesResult] =
    await Promise.allSettled([
      hasTickets
        ? fetchCrossStationData(input.tenantId, input.stationId, ticketIds)
        : Promise.resolve({ stationsByTicket: new Map(), progressByTicket: new Map() } as CrossStationData),
      fetchRecentlyCompleted(input.tenantId, resolvedLocationId, input.stationId, input.businessDate),
      fetchServedTodayCount(input.tenantId, resolvedLocationId, input.stationId, input.businessDate),
      hasActiveTabs
        ? fetchUpcomingCourses(input.tenantId, coreData.activeTabIds)
        : Promise.resolve([] as KdsUpcomingCourse[]),
    ]);

  // Apply cross-station enrichment (or safe defaults)
  if (crossStationResult.status === 'fulfilled') {
    const { stationsByTicket, progressByTicket } = crossStationResult.value;
    for (const card of coreData.ticketCards) {
      card.otherStations = stationsByTicket.get(card.ticketId) ?? [];
      const progress = progressByTicket.get(card.ticketId);
      if (progress) {
        card.totalOrderItems = progress.total;
        card.totalOrderReadyItems = progress.ready;
      }
    }
  } else {
    warnOnce(
      `cross-station:${input.stationId}`,
      '[kds] getKdsView: cross-station query failed — showing tickets without cross-station data',
      { domain: 'kds', tenantId: input.tenantId, stationId: input.stationId,
        error: { message: crossStationResult.reason instanceof Error ? crossStationResult.reason.message : String(crossStationResult.reason) } },
    );
  }

  // Recently completed (fallback: empty list)
  let recentlyCompleted: KdsCompletedTicket[] = [];
  if (completedResult.status === 'fulfilled') {
    recentlyCompleted = completedResult.value;
  } else {
    warnOnce(
      `completed:${input.stationId}`,
      '[kds] getKdsView: recently-completed query failed — continuing without history',
      { domain: 'kds', tenantId: input.tenantId, stationId: input.stationId,
        error: { message: completedResult.reason instanceof Error ? completedResult.reason.message : String(completedResult.reason) } },
    );
  }

  // Served today count (fallback: 0)
  let servedTodayCount = 0;
  if (servedResult.status === 'fulfilled') {
    servedTodayCount = servedResult.value;
  } else {
    warnOnce(
      `served:${input.stationId}`,
      '[kds] getKdsView: served-today query failed — showing 0',
      { domain: 'kds', tenantId: input.tenantId, stationId: input.stationId,
        error: { message: servedResult.reason instanceof Error ? servedResult.reason.message : String(servedResult.reason) } },
    );
  }

  // Upcoming courses (fallback: empty list)
  let upcomingCourses: KdsUpcomingCourse[] = [];
  if (coursesResult.status === 'fulfilled') {
    upcomingCourses = coursesResult.value;
  } else {
    warnOnce(
      `courses:${input.stationId}`,
      '[kds] getKdsView: upcoming courses query failed — continuing without timeline',
      { domain: 'kds', tenantId: input.tenantId, stationId: input.stationId,
        locationId: input.locationId, activeTabCount: coreData.activeTabIds.length,
        error: { message: coursesResult.reason instanceof Error ? coursesResult.reason.message : String(coursesResult.reason) } },
    );
  }

  const { station } = coreData;
  return {
    stationId: input.stationId,
    stationName: station.displayName ?? station.name ?? 'Station',
    stationType: station.stationType,
    stationColor: station.color,
    warningThresholdSeconds: station.warningThresholdSeconds,
    criticalThresholdSeconds: station.criticalThresholdSeconds,
    rushMode: station.rushMode,
    tickets: coreData.ticketCards,
    activeTicketCount: coreData.ticketCards.length,
    recentlyCompleted,
    servedTodayCount,
    upcomingCourses,
  };
}
