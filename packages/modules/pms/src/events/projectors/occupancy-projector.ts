/**
 * Occupancy read model projector.
 * Maintains rm_pms_daily_occupancy — per-property per-day occupancy stats.
 * Recalculates affected date range on any reservation event.
 *
 * Performance: uses set-based SQL (generate_series + CTEs) instead of per-day loop.
 * A 30-day range executes 3 queries total (room counts + occupancy CTE + batch upsert).
 */
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';

const CONSUMER_NAME = 'pms.occupancyProjector';

/**
 * Recalculate occupancy for a date range using set-based SQL.
 * Single CTE query computes occupied/arrivals/departures for ALL dates at once,
 * then batch upserts the results.
 */
async function recalculateOccupancy(
  tx: any,
  tenantId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  // 1. Get total active rooms and OOO count in a single query
  const roomCountRows = await tx.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE is_active = true)::int AS total_rooms,
      COUNT(*) FILTER (WHERE is_active = true AND is_out_of_order = true)::int AS ooo_rooms
    FROM pms_rooms
    WHERE tenant_id = ${tenantId}
      AND property_id = ${propertyId}
  `);
  const roomCounts = Array.from(roomCountRows as Iterable<Record<string, unknown>>)[0] ?? {};
  const totalRooms = Number(roomCounts.total_rooms ?? 0);
  const oooRooms = Number(roomCounts.ooo_rooms ?? 0);

  // 2. Single CTE query: generate all dates, compute occupied/arrivals/departures per date
  const dailyStats = await tx.execute(sql`
    WITH dates AS (
      SELECT d::date AS business_date
      FROM generate_series(${startDate}::date, ${endDate}::date - interval '1 day', '1 day') d
    ),
    occupied AS (
      SELECT dates.business_date,
             COUNT(DISTINCT rb.room_id)::int AS rooms_occupied
      FROM dates
      LEFT JOIN pms_room_blocks rb
        ON rb.tenant_id = ${tenantId}
        AND rb.is_active = true
        AND rb.block_type = 'RESERVATION'
        AND rb.start_date <= dates.business_date
        AND rb.end_date > dates.business_date
      LEFT JOIN pms_reservations r
        ON r.id = rb.reservation_id
        AND r.tenant_id = rb.tenant_id
        AND r.status IN ('CONFIRMED', 'CHECKED_IN')
      GROUP BY dates.business_date
    ),
    arr AS (
      SELECT dates.business_date, COUNT(r.id)::int AS arrivals
      FROM dates
      LEFT JOIN pms_reservations r
        ON r.tenant_id = ${tenantId}
        AND r.property_id = ${propertyId}
        AND r.check_in_date = dates.business_date
        AND r.status IN ('CONFIRMED', 'CHECKED_IN')
      GROUP BY dates.business_date
    ),
    dep AS (
      SELECT dates.business_date, COUNT(r.id)::int AS departures
      FROM dates
      LEFT JOIN pms_reservations r
        ON r.tenant_id = ${tenantId}
        AND r.property_id = ${propertyId}
        AND r.check_out_date = dates.business_date
        AND r.status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT')
      GROUP BY dates.business_date
    )
    SELECT
      d.business_date,
      COALESCE(o.rooms_occupied, 0)::int AS rooms_occupied,
      COALESCE(a.arrivals, 0)::int AS arrivals,
      COALESCE(dp.departures, 0)::int AS departures
    FROM dates d
    LEFT JOIN occupied o ON o.business_date = d.business_date
    LEFT JOIN arr a ON a.business_date = d.business_date
    LEFT JOIN dep dp ON dp.business_date = d.business_date
    ORDER BY d.business_date
  `);

  const stats = Array.from(dailyStats as Iterable<Record<string, unknown>>);
  if (stats.length === 0) return;

  // 3. Batch upsert all dates in a single statement using UNNEST
  const ids: string[] = [];
  const businessDates: string[] = [];
  const roomsOccupiedArr: number[] = [];
  const roomsAvailableArr: number[] = [];
  const occupancyPctArr: string[] = [];
  const arrivalsArr: number[] = [];
  const departuresArr: number[] = [];

  for (const row of stats) {
    const occupied = Number(row.rooms_occupied ?? 0);
    const available = totalRooms - occupied - oooRooms;
    const pct = totalRooms > 0 ? Math.round((occupied / totalRooms) * 10000) / 100 : 0;

    ids.push(generateUlid());
    businessDates.push(String(row.business_date).split('T')[0]!);
    roomsOccupiedArr.push(occupied);
    roomsAvailableArr.push(available);
    occupancyPctArr.push(String(pct));
    arrivalsArr.push(Number(row.arrivals ?? 0));
    departuresArr.push(Number(row.departures ?? 0));
  }

  await tx.execute(sql`
    INSERT INTO rm_pms_daily_occupancy (
      id, tenant_id, property_id, business_date,
      total_rooms, rooms_occupied, rooms_available, rooms_out_of_order,
      occupancy_pct, arrivals, departures, created_at, updated_at
    )
    SELECT
      unnest(${ids}::text[]),
      ${tenantId},
      ${propertyId},
      unnest(${businessDates}::date[]),
      ${totalRooms},
      unnest(${roomsOccupiedArr}::int[]),
      unnest(${roomsAvailableArr}::int[]),
      ${oooRooms},
      unnest(${occupancyPctArr}::numeric[]),
      unnest(${arrivalsArr}::int[]),
      unnest(${departuresArr}::int[]),
      NOW(),
      NOW()
    ON CONFLICT (tenant_id, property_id, business_date)
    DO UPDATE SET
      total_rooms = EXCLUDED.total_rooms,
      rooms_occupied = EXCLUDED.rooms_occupied,
      rooms_available = EXCLUDED.rooms_available,
      rooms_out_of_order = EXCLUDED.rooms_out_of_order,
      occupancy_pct = EXCLUDED.occupancy_pct,
      arrivals = EXCLUDED.arrivals,
      departures = EXCLUDED.departures,
      updated_at = NOW()
  `);
}

/**
 * Handle any reservation lifecycle event for occupancy projection.
 */
export async function handleOccupancyProjection(event: EventEnvelope): Promise<void> {
  const data = event.data as Record<string, unknown>;

  await withTenant(event.tenantId, async (tx) => {
    // Atomic idempotency check
    const inserted = await tx.execute(sql`
      INSERT INTO processed_events (id, tenant_id, event_id, consumer_name, processed_at)
      VALUES (${generateUlid()}, ${event.tenantId}, ${event.eventId}, ${CONSUMER_NAME}, NOW())
      ON CONFLICT (event_id, consumer_name) DO NOTHING
      RETURNING id
    `);
    const rows = Array.from(inserted as Iterable<{ id: string }>);
    if (rows.length === 0) return; // Already processed

    const propertyId = String(data.propertyId ?? '');
    if (!propertyId) return;

    // Determine affected date range
    let startDate: string;
    let endDate: string;

    if (data.before && data.after) {
      // Move/resize: recalculate both old and new ranges
      const before = data.before as { checkInDate?: string; checkOutDate?: string };
      const after = data.after as { checkInDate?: string; checkOutDate?: string };
      const bCI = before.checkInDate ?? '';
      const aCI = after.checkInDate ?? '';
      startDate = bCI < aCI ? bCI : aCI;
      const bCO = before.checkOutDate ?? '';
      const aCO = after.checkOutDate ?? '';
      endDate = bCO > aCO ? bCO : aCO;
    } else {
      startDate = String(data.checkInDate ?? '');
      endDate = String(data.checkOutDate ?? '');
    }

    if (!startDate || !endDate) return;

    await recalculateOccupancy(tx, event.tenantId, propertyId, startDate, endDate);
  });
}
