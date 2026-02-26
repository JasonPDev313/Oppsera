import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { HostListWaitlistFilterInput } from '../validation-host';

export interface HostWaitlistStats {
  currentCount: number;
  avgWaitMinutes: number;
  longestWaitMinutes: number;
  nextEstimatedWait: number;
}

/**
 * Returns aggregate stats for the active waitlist (status IN ('waiting', 'notified')).
 *
 * - currentCount: total active entries
 * - avgWaitMinutes: average elapsed wait time across active entries
 * - longestWaitMinutes: maximum elapsed wait time
 * - nextEstimatedWait: estimated wait for the next guest to be added,
 *   computed as the average quoted_wait_minutes for active entries (or avgWaitMinutes as fallback)
 */
export async function hostGetWaitlistStats(
  input: HostListWaitlistFilterInput,
): Promise<HostWaitlistStats> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS current_count,
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (now() - added_at)) / 60),
          0
        )::numeric(10,1) AS avg_wait_minutes,
        COALESCE(
          MAX(EXTRACT(EPOCH FROM (now() - added_at)) / 60),
          0
        )::numeric(10,1) AS longest_wait_minutes,
        COALESCE(
          AVG(quoted_wait_minutes) FILTER (WHERE quoted_wait_minutes IS NOT NULL),
          AVG(EXTRACT(EPOCH FROM (now() - added_at)) / 60),
          0
        )::numeric(10,1) AS next_estimated_wait
      FROM fnb_waitlist_entries
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND status IN ('waiting', 'notified')
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const row = allRows[0] ?? {};

    return {
      currentCount: Number(row.current_count ?? 0),
      avgWaitMinutes: Math.round(Number(row.avg_wait_minutes ?? 0)),
      longestWaitMinutes: Math.round(Number(row.longest_wait_minutes ?? 0)),
      nextEstimatedWait: Math.round(Number(row.next_estimated_wait ?? 0)),
    };
  });
}
