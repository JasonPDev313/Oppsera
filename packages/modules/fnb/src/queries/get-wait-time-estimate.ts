import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetWaitTimeEstimateInput } from '../validation';

export interface WaitTimeEstimate {
  estimatedMinutes: number;
  confidence: 'high' | 'medium' | 'low';
  basedOnSamples: number;
  currentQueueLength: number;
  currentAvgWait: number;
  partySizeAdjustment: number;
}

/**
 * Estimates wait time for a new party based on:
 * 1. Historical wait times for same day-of-week + hour + party-size bucket
 * 2. Current queue depth and turnover rate
 * 3. Available table count
 */
export async function getWaitTimeEstimate(
  input: GetWaitTimeEstimateInput,
): Promise<WaitTimeEstimate> {
  return withTenant(input.tenantId, async (tx) => {
    const partySize = input.partySize;
    const now = new Date();
    const businessDate = now.toISOString().slice(0, 10);
    const dayOfWeek = now.getDay(); // 0=Sun
    const hourOfDay = now.getHours();

    // Party size bucket: 1-2, 3-4, 5-6, 7+
    const sizeBucket = partySize <= 2 ? '1-2' : partySize <= 4 ? '3-4' : partySize <= 6 ? '5-6' : '7+';

    const [historyRows, queueRows, tableRows] = await Promise.all([
      // Historical wait times (last 30 days, same day + hour + size bucket)
      tx.execute(sql`
        SELECT
          AVG(actual_wait_minutes)::int AS avg_wait,
          COUNT(*)::int AS sample_count,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY actual_wait_minutes)::int AS p75_wait
        FROM fnb_wait_time_history
        WHERE tenant_id = ${input.tenantId}
          AND location_id = ${input.locationId}
          AND day_of_week = ${dayOfWeek}
          AND hour_of_day = ${hourOfDay}
          AND party_size_bucket = ${sizeBucket}
          AND recorded_at > now() - interval '30 days'
      `),

      // Current queue state
      tx.execute(sql`
        SELECT
          COUNT(*)::int AS queue_length,
          COALESCE(AVG(
            EXTRACT(EPOCH FROM (now() - added_at)) / 60
          ), 0)::int AS current_avg_elapsed,
          COALESCE(AVG(actual_wait_minutes) FILTER (WHERE status = 'seated'), 0)::int AS today_avg_wait,
          COUNT(*) FILTER (WHERE status = 'seated')::int AS seated_today
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${input.tenantId}
          AND location_id = ${input.locationId}
          AND business_date = ${businessDate}
          AND status IN ('waiting', 'notified', 'seated')
      `),

      // Available tables matching party size
      tx.execute(sql`
        SELECT COUNT(*)::int AS available_count
        FROM fnb_tables t
        LEFT JOIN fnb_table_live_status ls ON ls.table_id = t.id AND ls.tenant_id = t.tenant_id
        WHERE t.tenant_id = ${input.tenantId}
          AND t.location_id = ${input.locationId}
          AND t.is_active = true
          AND t.max_capacity >= ${partySize}
          AND COALESCE(ls.status, 'available') = 'available'
      `),
    ]);

    const history = Array.from(historyRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const queue = Array.from(queueRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const tables = Array.from(tableRows as Iterable<Record<string, unknown>>)[0] ?? {};

    const historicalAvg = Number(history.avg_wait ?? 0);
    const historicalP75 = Number(history.p75_wait ?? 0);
    const sampleCount = Number(history.sample_count ?? 0);
    const queueLength = Number(queue.queue_length ?? 0);
    const todayAvgWait = Number(queue.today_avg_wait ?? 0);
    const availableCount = Number(tables.available_count ?? 0);

    // Calculate estimate using weighted blend
    let estimatedMinutes: number;
    let confidence: 'high' | 'medium' | 'low';

    if (availableCount > 0 && queueLength === 0) {
      // Tables available and no queue = immediate seating
      estimatedMinutes = 0;
      confidence = 'high';
    } else if (sampleCount >= 10) {
      // Good historical data: weighted blend of historical P75 and today's actual
      const todayWeight = todayAvgWait > 0 ? 0.4 : 0;
      const historyWeight = 1 - todayWeight;
      estimatedMinutes = Math.round(
        historyWeight * historicalP75 + todayWeight * todayAvgWait,
      );
      // Adjust for queue position
      estimatedMinutes += Math.round(queueLength * 3); // ~3 min per party ahead
      confidence = 'high';
    } else if (sampleCount >= 3 || todayAvgWait > 0) {
      // Some data available
      const baseWait = sampleCount >= 3 ? historicalAvg : todayAvgWait;
      estimatedMinutes = baseWait + Math.round(queueLength * 4);
      confidence = 'medium';
    } else {
      // No data — use heuristic
      const baseWait = partySize <= 2 ? 15 : partySize <= 4 ? 20 : partySize <= 6 ? 30 : 45;
      estimatedMinutes = baseWait + Math.round(queueLength * 5);
      confidence = 'low';
    }

    // Party size adjustment: larger parties wait longer
    const partySizeAdjustment = partySize > 4 ? Math.round((partySize - 4) * 3) : 0;
    estimatedMinutes += partySizeAdjustment;

    // Floor at 0
    estimatedMinutes = Math.max(0, estimatedMinutes);

    return {
      estimatedMinutes,
      confidence,
      basedOnSamples: sampleCount,
      currentQueueLength: queueLength,
      currentAvgWait: todayAvgWait,
      partySizeAdjustment,
    };
  });
}
