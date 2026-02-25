import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetHostDashboardInput } from '../validation';
import { mapReservationRow } from '../commands/create-reservation';

export interface WaitlistEntry {
  id: string;
  guestName: string;
  guestPhone: string | null;
  partySize: number;
  quotedWaitMinutes: number | null;
  status: string;
  priority: number;
  position: number;
  seatingPreference: string | null;
  specialRequests: string | null;
  isVip: boolean;
  vipNote: string | null;
  customerId: string | null;
  addedAt: string;
  notifiedAt: string | null;
  elapsedMinutes: number;
  source: string;
  notes: string | null;
}

export interface ReservationEntry {
  id: string;
  guestName: string;
  guestPhone: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  durationMinutes: number;
  endTime: string | null;
  status: string;
  seatingPreference: string | null;
  specialRequests: string | null;
  occasion: string | null;
  isVip: boolean;
  assignedTableId: string | null;
  assignedTableLabel: string | null;
  notes: string | null;
  minutesUntil: number;
}

export interface TableSummary {
  total: number;
  available: number;
  seated: number;
  reserved: number;
  dirty: number;
  blocked: number;
}

export interface ServerSummary {
  serverUserId: string;
  serverName: string | null;
  sectionNames: string[];
  coversServed: number;
  openTabCount: number;
  isNext: boolean;
}

export interface HostDashboard {
  waitlist: WaitlistEntry[];
  upcomingReservations: ReservationEntry[];
  tableSummary: TableSummary;
  servers: ServerSummary[];
  nextUpServerUserId: string | null;
  stats: {
    totalCoversToday: number;
    currentWaiting: number;
    avgWaitMinutes: number;
    reservationsToday: number;
    noShowsToday: number;
    seatedFromWaitlist: number;
  };
}

export async function getHostDashboard(
  input: GetHostDashboardInput,
): Promise<HostDashboard> {
  return withTenant(input.tenantId, async (tx) => {
    // Run all queries in parallel
    const [waitlistRows, reservationRows, tableRows, serverRows, statsRows, rotationRows] = await Promise.all([
      // Active waitlist
      tx.execute(sql`
        SELECT *,
          EXTRACT(EPOCH FROM (now() - added_at)) / 60 AS elapsed_minutes
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${input.tenantId}
          AND location_id = ${input.locationId}
          AND business_date = ${input.businessDate}
          AND status IN ('waiting', 'notified')
        ORDER BY priority DESC, position ASC
      `),

      // Today's upcoming reservations (within next 3 hours + checked_in)
      tx.execute(sql`
        SELECT r.*,
          t.display_label AS assigned_table_label,
          EXTRACT(EPOCH FROM (
            (${input.businessDate}::date + r.reservation_time) - now()
          )) / 60 AS minutes_until
        FROM fnb_reservations r
        LEFT JOIN fnb_tables t ON t.id = r.assigned_table_id AND t.tenant_id = r.tenant_id
        WHERE r.tenant_id = ${input.tenantId}
          AND r.location_id = ${input.locationId}
          AND r.reservation_date = ${input.businessDate}
          AND r.status IN ('confirmed', 'checked_in')
        ORDER BY r.reservation_time ASC
      `),

      // Table summary
      tx.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE COALESCE(ls.status, 'available') = 'available')::int AS available,
          COUNT(*) FILTER (WHERE ls.status IN ('seated', 'ordered', 'entrees_fired', 'dessert', 'check_presented'))::int AS seated,
          COUNT(*) FILTER (WHERE ls.status = 'reserved')::int AS reserved,
          COUNT(*) FILTER (WHERE ls.status = 'dirty')::int AS dirty,
          COUNT(*) FILTER (WHERE ls.status = 'blocked')::int AS blocked
        FROM fnb_tables t
        LEFT JOIN fnb_table_live_status ls ON ls.table_id = t.id AND ls.tenant_id = t.tenant_id
        WHERE t.tenant_id = ${input.tenantId}
          AND t.location_id = ${input.locationId}
          AND t.is_active = true
      `),

      // Servers on floor
      tx.execute(sql`
        SELECT
          a.server_user_id,
          u.name AS server_name,
          ARRAY_AGG(DISTINCT s.name) AS section_names,
          COALESCE(se.covers_served, 0)::int AS covers_served,
          COALESCE(se.open_tab_count, 0)::int AS open_tab_count
        FROM fnb_server_assignments a
        INNER JOIN fnb_sections s ON s.id = a.section_id
        LEFT JOIN users u ON u.id = a.server_user_id
        LEFT JOIN fnb_shift_extensions se ON se.server_user_id = a.server_user_id
          AND se.tenant_id = a.tenant_id AND se.business_date = a.business_date
        WHERE a.tenant_id = ${input.tenantId}
          AND a.location_id = ${input.locationId}
          AND a.business_date = ${input.businessDate}
          AND a.status = 'active'
        GROUP BY a.server_user_id, u.name, se.covers_served, se.open_tab_count
        ORDER BY COALESCE(se.covers_served, 0) ASC
      `),

      // Daily stats
      tx.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'seated' THEN party_size ELSE 0 END), 0)::int AS seated_covers,
          COUNT(*) FILTER (WHERE status IN ('waiting', 'notified'))::int AS current_waiting,
          COALESCE(AVG(actual_wait_minutes) FILTER (WHERE status = 'seated'), 0)::int AS avg_wait,
          (SELECT COUNT(*)::int FROM fnb_reservations
           WHERE tenant_id = ${input.tenantId} AND location_id = ${input.locationId}
           AND reservation_date = ${input.businessDate}) AS reservations_today,
          COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_shows,
          COUNT(*) FILTER (WHERE status = 'seated')::int AS seated_from_waitlist
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${input.tenantId}
          AND location_id = ${input.locationId}
          AND business_date = ${input.businessDate}
      `),

      // Rotation
      tx.execute(sql`
        SELECT next_server_user_id, rotation_order
        FROM fnb_rotation_tracker
        WHERE tenant_id = ${input.tenantId}
          AND location_id = ${input.locationId}
          AND business_date = ${input.businessDate}
        LIMIT 1
      `),
    ]);

    const waitlist = Array.from(waitlistRows as Iterable<Record<string, unknown>>).map(mapWaitlistEntry);
    const upcomingReservations = Array.from(reservationRows as Iterable<Record<string, unknown>>).map(mapReservationEntry);

    const tc = Array.from(tableRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const tableSummary: TableSummary = {
      total: Number(tc.total ?? 0),
      available: Number(tc.available ?? 0),
      seated: Number(tc.seated ?? 0),
      reserved: Number(tc.reserved ?? 0),
      dirty: Number(tc.dirty ?? 0),
      blocked: Number(tc.blocked ?? 0),
    };

    const rotation = Array.from(rotationRows as Iterable<Record<string, unknown>>)[0];
    const nextUpServerUserId = rotation ? String(rotation.next_server_user_id) : null;

    const servers = Array.from(serverRows as Iterable<Record<string, unknown>>).map((r) => ({
      serverUserId: String(r.server_user_id),
      serverName: r.server_name ? String(r.server_name) : null,
      sectionNames: (r.section_names as string[]) ?? [],
      coversServed: Number(r.covers_served),
      openTabCount: Number(r.open_tab_count),
      isNext: String(r.server_user_id) === nextUpServerUserId,
    }));

    const st = Array.from(statsRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const stats = {
      totalCoversToday: Number(st.seated_covers ?? 0),
      currentWaiting: Number(st.current_waiting ?? 0),
      avgWaitMinutes: Number(st.avg_wait ?? 0),
      reservationsToday: Number(st.reservations_today ?? 0),
      noShowsToday: Number(st.no_shows ?? 0),
      seatedFromWaitlist: Number(st.seated_from_waitlist ?? 0),
    };

    return {
      waitlist,
      upcomingReservations,
      tableSummary,
      servers,
      nextUpServerUserId,
      stats,
    };
  });
}

function mapWaitlistEntry(row: Record<string, unknown>): WaitlistEntry {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    partySize: Number(row.party_size),
    quotedWaitMinutes: row.quoted_wait_minutes != null ? Number(row.quoted_wait_minutes) : null,
    status: String(row.status),
    priority: Number(row.priority),
    position: Number(row.position),
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    isVip: Boolean(row.is_vip),
    vipNote: row.vip_note ? String(row.vip_note) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    addedAt: String(row.added_at),
    notifiedAt: row.notified_at ? String(row.notified_at) : null,
    elapsedMinutes: Math.round(Number(row.elapsed_minutes ?? 0)),
    source: String(row.source),
    notes: row.notes ? String(row.notes) : null,
  };
}

function mapReservationEntry(row: Record<string, unknown>): ReservationEntry {
  return {
    id: String(row.id),
    guestName: String(row.guest_name),
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
    partySize: Number(row.party_size),
    reservationDate: String(row.reservation_date),
    reservationTime: String(row.reservation_time),
    durationMinutes: Number(row.duration_minutes),
    endTime: row.end_time ? String(row.end_time) : null,
    status: String(row.status),
    seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
    specialRequests: row.special_requests ? String(row.special_requests) : null,
    occasion: row.occasion ? String(row.occasion) : null,
    isVip: Boolean(row.is_vip),
    assignedTableId: row.assigned_table_id ? String(row.assigned_table_id) : null,
    assignedTableLabel: row.assigned_table_label ? String(row.assigned_table_label) : null,
    notes: row.notes ? String(row.notes) : null,
    minutesUntil: Math.round(Number(row.minutes_until ?? 0)),
  };
}
