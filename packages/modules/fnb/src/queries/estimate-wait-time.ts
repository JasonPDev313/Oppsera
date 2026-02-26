import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import type { EstimateWaitTimeInput, WaitTimeEstimate, TurnTimeData, OccupancyData } from '../services/wait-time-estimator';
import { computeWaitTime, getPartySizeBucket, DEFAULT_TURN_TIMES } from '../services/wait-time-estimator';

/**
 * HOST V2: Estimate wait time for a walk-in party.
 * Fetches data from DB and delegates to the pure algorithm.
 */
export async function estimateWaitTime(input: EstimateWaitTimeInput): Promise<WaitTimeEstimate> {
  return withTenant(input.tenantId, async (tx) => {
    const bucket = getPartySizeBucket(input.partySize);
    const now = input.requestedAt ?? new Date();

    // 1. Query historical turn times for this bucket + meal period (last 28 days)
    const turnTimeRows = await tx.execute(sql`
      SELECT
        AVG(turn_time_minutes) AS avg_turn,
        COUNT(*) AS cnt
      FROM fnb_table_turn_log
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND meal_period = ${input.mealPeriod}
        AND turn_time_minutes IS NOT NULL
        AND created_at >= now() - interval '28 days'
        AND party_size BETWEEN ${bucket === 'small' ? 1 : bucket === 'medium' ? 3 : bucket === 'large' ? 5 : 7}
                        AND ${bucket === 'small' ? 2 : bucket === 'medium' ? 4 : bucket === 'large' ? 6 : 99}
    `);

    let turnTime: TurnTimeData;
    const turnRow = Array.from(turnTimeRows as Iterable<Record<string, unknown>>)[0];
    const cnt = Number(turnRow?.cnt ?? 0);

    if (cnt >= 10) {
      turnTime = {
        avgTurnTimeMinutes: Math.round(Number(turnRow?.avg_turn ?? 60)),
        dataPointCount: cnt,
      };
    } else {
      // Widen to all sizes for this meal period
      const widerRows = await tx.execute(sql`
        SELECT
          AVG(turn_time_minutes) AS avg_turn,
          COUNT(*) AS cnt
        FROM fnb_table_turn_log
        WHERE tenant_id = ${input.tenantId}
          AND location_id = ${input.locationId}
          AND meal_period = ${input.mealPeriod}
          AND turn_time_minutes IS NOT NULL
          AND created_at >= now() - interval '28 days'
      `);
      const widerRow = Array.from(widerRows as Iterable<Record<string, unknown>>)[0];
      const widerCnt = Number(widerRow?.cnt ?? 0);

      if (widerCnt >= 10) {
        turnTime = {
          avgTurnTimeMinutes: Math.round(Number(widerRow?.avg_turn ?? 60)),
          dataPointCount: widerCnt,
        };
      } else {
        turnTime = {
          avgTurnTimeMinutes: DEFAULT_TURN_TIMES[bucket] ?? 60,
          dataPointCount: widerCnt,
        };
      }
    }

    // 2. Get current occupancy from fnb_tables
    const occupancyRows = await tx.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE capacity_max >= ${input.partySize} OR is_combinable = true) AS total_tables,
        COUNT(*) FILTER (
          WHERE (capacity_max >= ${input.partySize} OR is_combinable = true)
          AND status IN ('occupied', 'payment_complete')
        ) AS occupied_tables
      FROM fnb_tables
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND is_active = true
    `);
    const occRow = Array.from(occupancyRows as Iterable<Record<string, unknown>>)[0];

    // 3. Count tables about to turn (80% through expected turn time)
    const aboutToTurnRows = await tx.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM fnb_table_turn_log tl
      WHERE tl.tenant_id = ${input.tenantId}
        AND tl.location_id = ${input.locationId}
        AND tl.cleared_at IS NULL
        AND tl.seated_at + (${turnTime.avgTurnTimeMinutes} * 0.8 * interval '1 minute') < ${now}
    `);
    const aboutToTurnRow = Array.from(aboutToTurnRows as Iterable<Record<string, unknown>>)[0];

    const occupancy: OccupancyData = {
      totalTables: Number(occRow?.total_tables ?? 0),
      occupiedTables: Number(occRow?.occupied_tables ?? 0),
      tablesAboutToTurn: Number(aboutToTurnRow?.cnt ?? 0),
    };

    // 4. Count upcoming reservation claims (next 2 hours)
    const claimRows = await tx.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM fnb_reservations
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND status IN ('booked', 'confirmed', 'checked_in')
        AND reservation_date = to_char(${now}::date, 'YYYY-MM-DD')
        AND reservation_time >= to_char(${now}::time, 'HH24:MI')
        AND reservation_time <= to_char((${now} + interval '2 hours')::time, 'HH24:MI')
        AND party_size >= ${input.partySize - 1}
    `);
    const claimRow = Array.from(claimRows as Iterable<Record<string, unknown>>)[0];
    const upcomingClaims = Number(claimRow?.cnt ?? 0);

    return computeWaitTime(turnTime, occupancy, upcomingClaims, input.partySize);
  });
}
