import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { logger } from '@oppsera/core/observability';
import type { GetKdsViewInput } from '../validation';
import { StationNotFoundError, ExpoStationError } from '../errors';

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

export async function getKdsView(
  input: GetKdsViewInput,
): Promise<KdsView> {
  return withTenant(input.tenantId, async (tx) => {
    // Get station info
    // Location guard: always filter by location_id. If the caller didn't provide
    // one (shouldn't happen — middleware requires it), fall back to a hard error
    // rather than silently serving cross-location data.
    if (!input.locationId) {
      throw new StationNotFoundError(input.stationId);
    }
    const resolvedLocationId = input.locationId;

    const stationRows = await tx.execute(
      sql`SELECT id, name, display_name, station_type, color,
                 warning_threshold_seconds, critical_threshold_seconds,
                 rush_mode, location_id
          FROM fnb_kitchen_stations
          WHERE id = ${input.stationId} AND tenant_id = ${input.tenantId}
            AND location_id = ${resolvedLocationId}
          LIMIT 1`,
    );
    const stationArr = Array.from(stationRows as Iterable<Record<string, unknown>>);
    const station = stationArr[0];
    if (!station) throw new StationNotFoundError(input.stationId);
    if ((station.station_type as string) === 'expo') throw new ExpoStationError(input.stationId);

    // Get active tickets that have items at this station.
    // No business_date filter — tickets must remain visible until bumped or voided,
    // even if they span across business days (e.g., internet outage, forgotten tickets).
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

    // [KDS-DIAG] Debug-level diagnostic — only runs when no tickets found.
    if (tickets.length === 0) {
      const diagRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS total_active,
               COUNT(*) FILTER (WHERE kt.business_date = ${input.businessDate})::int AS active_today,
               COUNT(*) FILTER (WHERE kt.business_date < ${input.businessDate})::int AS active_stale
        FROM fnb_kitchen_tickets kt
        INNER JOIN fnb_kitchen_ticket_items kti
          ON kti.ticket_id = kt.id AND kti.station_id = ${input.stationId}
          AND kti.item_status NOT IN ('served', 'voided')
        WHERE kt.tenant_id = ${input.tenantId}
          AND kt.location_id = ${resolvedLocationId}
          AND kt.status IN ('pending', 'in_progress')`);
      const diag = Array.from(diagRows as Iterable<Record<string, unknown>>)[0];
      logger.debug('[KDS-DIAG] No active tickets for station', {
        domain: 'kds',
        tenantId: input.tenantId,
        stationId: input.stationId,
        locationId: resolvedLocationId,
        businessDate: input.businessDate,
        totalActive: Number(diag?.total_active ?? 0),
        activeToday: Number(diag?.active_today ?? 0),
        activeStale: Number(diag?.active_stale ?? 0),
      });
    }

    // Batch-fetch all items for all active tickets at this station in a single query
    // (fixes N+1: previously one SELECT per ticket)
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
          itemName: r.item_name as string,
          kitchenLabel: (r.kitchen_label as string) ?? null,
          itemColor: (r.item_color as string) ?? null,
          modifierSummary: (r.modifier_summary as string) ?? null,
          specialInstructions: (r.special_instructions as string) ?? null,
          seatNumber: r.seat_number != null ? Number(r.seat_number) : null,
          courseName: (r.course_name as string) ?? null,
          quantity: Number(r.quantity),
          itemStatus: r.item_status as string,
          priorityLevel: Number(r.priority_level ?? 0),
          estimatedPrepSeconds: r.estimated_prep_seconds != null ? Number(r.estimated_prep_seconds) : null,
          routingRuleId: (r.routing_rule_id as string) ?? null,
          stationId: (r.station_id as string) ?? null,
          isRush: r.is_rush as boolean,
          isAllergy: r.is_allergy as boolean,
          isVip: r.is_vip as boolean,
          startedAt: (r.started_at as string) ?? null,
          readyAt: (r.ready_at as string) ?? null,
          bumpedBy: (r.bumped_by as string) ?? null,
          elapsedSeconds: Number(r.elapsed_seconds),
        };
        if (!itemsByTicket.has(tid)) itemsByTicket.set(tid, []);
        itemsByTicket.get(tid)!.push(item);
      }
    }

    const warnThreshold = Number(station.warning_threshold_seconds ?? 480);
    const critThreshold = Number(station.critical_threshold_seconds ?? 720);

    const ticketCards: KdsTicketCard[] = tickets.map((t) => {
      const items = itemsByTicket.get(t.id as string) ?? [];
      const elapsed = Number(t.elapsed_seconds);
      const alertLevel: 'normal' | 'warning' | 'critical' =
        elapsed >= critThreshold ? 'critical' :
        elapsed >= warnThreshold ? 'warning' : 'normal';
      return {
        ticketId: t.id as string,
        ticketNumber: Number(t.ticket_number),
        tabId: t.tab_id as string,
        courseNumber: t.course_number != null ? Number(t.course_number) : null,
        courseName: (t.course_name as string) ?? null,
        status: t.status as string,
        priorityLevel: Number(t.priority_level ?? 0),
        isHeld: (t.is_held as boolean) ?? false,
        orderType: (t.order_type as string) ?? null,
        channel: (t.channel as string) ?? null,
        tableNumber: t.table_number != null ? Number(t.table_number) : null,
        serverName: (t.server_name as string) ?? null,
        customerName: (t.customer_name as string) ?? null,
        sentAt: t.sent_at as string,
        estimatedPickupAt: (t.estimated_pickup_at as string) ?? null,
        elapsedSeconds: Number(t.elapsed_seconds),
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
        totalOrderItems: items.length,     // will be updated by cross-station query
        totalOrderReadyItems: items.filter((i) => i.itemStatus === 'ready').length,
      };
    });

    // Fetch cross-station "Also At" data for all active tickets.
    // Since each ticket is single-station (consumers group items by station and
    // create separate tickets), we look up sibling tickets for the same ORDER
    // at other stations to show cross-station visibility.
    if (ticketCards.length > 0) {
      const ticketIds = ticketCards.map((tc) => tc.ticketId);
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
              AND kti_other.station_id != ${input.stationId}
              AND kti_other.item_status NOT IN ('served', 'voided')
            INNER JOIN fnb_kitchen_stations ks
              ON ks.id = kti_other.station_id AND ks.tenant_id = ${input.tenantId}
            WHERE kt_this.id IN (${sql.join(ticketIds.map((id) => sql`${id}`), sql`, `)})`,
      );
      const otherStations = Array.from(otherStationRows as Iterable<Record<string, unknown>>);
      const stationsByTicket = new Map<string, { stationId: string; stationName: string }[]>();
      for (const row of otherStations) {
        const tid = row.ticket_id as string;
        if (!stationsByTicket.has(tid)) stationsByTicket.set(tid, []);
        const existing = stationsByTicket.get(tid)!;
        // Deduplicate by stationId
        if (!existing.some((s) => s.stationId === (row.station_id as string))) {
          existing.push({
            stationId: row.station_id as string,
            stationName: (row.station_name as string) ?? 'Unknown',
          });
        }
      }
      for (const card of ticketCards) {
        card.otherStations = stationsByTicket.get(card.ticketId) ?? [];
      }

      // Cross-station order progress: total/ready items across ALL stations for each order
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
      for (const row of Array.from(progressRows as Iterable<Record<string, unknown>>)) {
        const card = ticketCards.find((c) => c.ticketId === (row.ticket_id as string));
        if (card) {
          card.totalOrderItems = Number(row.total_order_items);
          card.totalOrderReadyItems = Number(row.ready_order_items);
        }
      }
    }

    // Fetch recently completed tickets at this station (all items ready/served/voided)
    // Use COALESCE(served_at, ready_at) so the timestamp reflects the final bump, not the first
    const completedRows = await tx.execute(
      sql`SELECT kt.id, kt.ticket_number, kt.table_number, kt.server_name,
                 COUNT(kti.id)::integer AS item_count,
                 COALESCE(MAX(kti.served_at), MAX(kti.ready_at)) AS completed_at,
                 EXTRACT(EPOCH FROM (NOW() - COALESCE(MAX(kti.served_at), MAX(kti.ready_at))))::integer AS completed_seconds_ago
          FROM fnb_kitchen_tickets kt
          INNER JOIN fnb_kitchen_ticket_items kti
            ON kti.ticket_id = kt.id AND kti.station_id = ${input.stationId}
          WHERE kt.tenant_id = ${input.tenantId}
            AND kt.location_id = ${resolvedLocationId}
            AND kt.business_date = ${input.businessDate}
            AND kti.item_status IN ('ready', 'served')
            AND NOT EXISTS (
              SELECT 1 FROM fnb_kitchen_ticket_items kti2
              WHERE kti2.ticket_id = kt.id
                AND kti2.station_id = ${input.stationId}
                AND kti2.item_status NOT IN ('ready', 'served', 'voided')
            )
          GROUP BY kt.id
          ORDER BY COALESCE(MAX(kti.served_at), MAX(kti.ready_at)) DESC NULLS LAST
          LIMIT 20`,
    );
    const recentlyCompleted: KdsCompletedTicket[] = Array.from(
      completedRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      ticketId: r.id as string,
      ticketNumber: Number(r.ticket_number),
      tableNumber: r.table_number != null ? Number(r.table_number) : null,
      serverName: (r.server_name as string) ?? null,
      itemCount: Number(r.item_count),
      completedAt: (r.completed_at as string) ?? '',
      completedSecondsAgo: Number(r.completed_seconds_ago ?? 0),
    }));

    // Served today count — tickets this station has completed today
    const servedCountRows = await tx.execute(
      sql`SELECT COUNT(DISTINCT kt.id)::integer AS served_count
          FROM fnb_kitchen_tickets kt
          WHERE kt.tenant_id = ${input.tenantId}
            AND kt.location_id = ${resolvedLocationId}
            AND kt.business_date = ${input.businessDate}
            AND kt.status IN ('served', 'ready')
            AND EXISTS (
              SELECT 1 FROM fnb_kitchen_ticket_items kti
              WHERE kti.ticket_id = kt.id AND kti.station_id = ${input.stationId}
            )`,
    );
    const servedTodayCount = Number(
      (Array.from(servedCountRows as Iterable<Record<string, unknown>>)[0]?.served_count) ?? 0,
    );

    // Upcoming courses — held/unsent courses for tabs with active tickets
    const activeTabIds = [...new Set(ticketCards.map((c) => c.tabId).filter(Boolean))];
    let upcomingCourses: KdsUpcomingCourse[] = [];
    if (activeTabIds.length > 0) {
      const courseRows = await tx.execute(
        sql`SELECT tc.tab_id, tc.course_number, tc.course_name, tc.status AS course_status,
                   t.table_number,
                   (SELECT COUNT(*)::integer FROM fnb_tab_lines tl
                    WHERE tl.tab_id = tc.tab_id AND tl.course_number = tc.course_number
                      AND tl.tenant_id = tc.tenant_id AND tl.status != 'voided') AS item_count
            FROM fnb_tab_courses tc
            LEFT JOIN fnb_tabs t ON t.id = tc.tab_id AND t.tenant_id = tc.tenant_id
            WHERE tc.tenant_id = ${input.tenantId}
              AND tc.status IN ('unsent', 'sent', 'held')
              AND tc.tab_id IN (${sql.join(activeTabIds.map((id) => sql`${id}`), sql`, `)})
            ORDER BY tc.tab_id, tc.course_number`,
      );
      upcomingCourses = Array.from(courseRows as Iterable<Record<string, unknown>>).map((r) => ({
        tabId: r.tab_id as string,
        courseNumber: Number(r.course_number),
        courseName: (r.course_name as string) ?? null,
        courseStatus: r.course_status as string,
        itemCount: Number(r.item_count ?? 0),
        tableNumber: r.table_number != null ? Number(r.table_number) : null,
      }));
    }

    return {
      stationId: input.stationId,
      stationName: (station.display_name as string) ?? (station.name as string),
      stationType: station.station_type as string,
      stationColor: (station.color as string) ?? null,
      warningThresholdSeconds: Number(station.warning_threshold_seconds ?? 480),
      criticalThresholdSeconds: Number(station.critical_threshold_seconds ?? 720),
      rushMode: (station.rush_mode as boolean) ?? false,
      tickets: ticketCards,
      activeTicketCount: ticketCards.length,
      recentlyCompleted,
      servedTodayCount,
      upcomingCourses,
    };
  });
}
