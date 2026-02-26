import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { DEFAULT_TURN_TIMES, getPartySizeBucket } from '../services/wait-time-estimator';

// ── Types ───────────────────────────────────────────────────────

export interface TableAvailabilityForecastInput {
  tenantId: string;
  locationId: string;
  hoursAhead?: number; // default 4
}

export interface TableForecastEntry {
  tableId: string;
  tableNumber: string;
  capacity: number;
  estimatedAvailableAt: string | null; // ISO timestamp, null if available now
  currentPartySize: number | null;
  seatedAt: string | null;
}

/**
 * HOST V2: Forecast when each occupied table will become available.
 * For available tables, estimatedAvailableAt is null (available now).
 * For occupied tables, calculates based on avgTurnTime for the party size.
 */
export async function getTableAvailabilityForecast(
  input: TableAvailabilityForecastInput,
): Promise<TableForecastEntry[]> {
  const hoursAhead = input.hoursAhead ?? 4;

  return withTenant(input.tenantId, async (tx) => {
    // Get all active tables with current occupancy info from turn log
    const rows = await tx.execute(sql`
      SELECT
        t.id AS table_id,
        t.table_number,
        t.capacity_max AS capacity,
        t.status,
        tl.party_size AS current_party_size,
        tl.seated_at,
        tl.meal_period
      FROM fnb_tables t
      LEFT JOIN fnb_table_turn_log tl
        ON tl.table_id = t.id
        AND tl.tenant_id = t.tenant_id
        AND tl.cleared_at IS NULL
      WHERE t.tenant_id = ${input.tenantId}
        AND t.location_id = ${input.locationId}
        AND t.is_active = true
      ORDER BY t.table_number::int
    `);

    // Get avg turn times per party size bucket for this location
    const avgRows = await tx.execute(sql`
      SELECT
        CASE
          WHEN party_size <= 2 THEN 'small'
          WHEN party_size <= 4 THEN 'medium'
          WHEN party_size <= 6 THEN 'large'
          ELSE 'xlarge'
        END AS bucket,
        AVG(turn_time_minutes) AS avg_turn
      FROM fnb_table_turn_log
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND turn_time_minutes IS NOT NULL
        AND created_at >= now() - interval '28 days'
      GROUP BY bucket
    `);
    const avgByBucket = new Map<string, number>();
    for (const row of Array.from(avgRows as Iterable<Record<string, unknown>>)) {
      avgByBucket.set(String(row.bucket), Math.round(Number(row.avg_turn)));
    }

    const cutoff = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => {
      const status = String(row.status);
      const seatedAt = row.seated_at ? String(row.seated_at) : null;
      const partySize = row.current_party_size ? Number(row.current_party_size) : null;

      let estimatedAvailableAt: string | null = null;

      if (status === 'occupied' || status === 'payment_complete') {
        if (seatedAt && partySize) {
          const bucket = getPartySizeBucket(partySize);
          const avgTurn = avgByBucket.get(bucket) ?? DEFAULT_TURN_TIMES[bucket] ?? 60;
          const seated = new Date(seatedAt);
          const estimated = new Date(seated.getTime() + avgTurn * 60 * 1000);

          // Only include if within forecast window
          if (estimated <= cutoff) {
            estimatedAvailableAt = estimated.toISOString();
          } else {
            estimatedAvailableAt = estimated.toISOString();
          }
        }
      }

      return {
        tableId: String(row.table_id),
        tableNumber: String(row.table_number),
        capacity: Number(row.capacity),
        estimatedAvailableAt,
        currentPartySize: partySize,
        seatedAt,
      };
    });
  });
}
