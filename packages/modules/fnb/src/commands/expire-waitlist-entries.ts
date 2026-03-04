import { createAdminClient } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export interface ExpireWaitlistResult {
  expiredCount: number;
  expiredIds: string[];
}

/**
 * Sweep all tenants for waitlist entries that have been notified but not seated
 * within the grace period. Called by Vercel cron (no user context).
 *
 * For each tenant/location config:
 * - If autoRemoveAfterGrace = true AND notified_at + graceMinutes < now()
 *   → set status = 'expired'
 * - Recompute positions for remaining active entries
 *
 * Uses LATERAL JOIN to prefer location-specific config over tenant-wide default.
 * Uses admin client (no RLS) since this runs from a cron with no tenant context.
 */
export async function expireWaitlistEntries(): Promise<ExpireWaitlistResult> {
  const adminDb = createAdminClient();

  // Expire notified entries past grace period.
  // LATERAL JOIN ensures location-specific config is preferred over tenant-wide default
  // (location_id IS NULL sorts after a real match, so LIMIT 1 picks location-specific first).
  const expiredRows = await adminDb.execute(sql`
    UPDATE fnb_waitlist_entries e
    SET status = 'expired', updated_at = now()
    FROM (
      SELECT e2.id
      FROM fnb_waitlist_entries e2
      LEFT JOIN LATERAL (
        SELECT notification_config
        FROM fnb_waitlist_config c
        WHERE c.tenant_id = e2.tenant_id
          AND (c.location_id = e2.location_id OR c.location_id IS NULL)
        ORDER BY c.location_id IS NULL ASC
        LIMIT 1
      ) c ON true
      WHERE e2.status = 'notified'
        AND e2.notified_at IS NOT NULL
        AND e2.notified_at + make_interval(
          mins => COALESCE((c.notification_config->>'graceMinutes')::int, 10)
        ) < now()
        AND COALESCE((c.notification_config->>'autoRemoveAfterGrace')::boolean, true) = true
    ) expired
    WHERE e.id = expired.id
    RETURNING e.id, e.tenant_id, e.location_id, e.business_date
  `);

  const expired = Array.from(expiredRows as Iterable<Record<string, unknown>>);
  if (expired.length === 0) {
    return { expiredCount: 0, expiredIds: [] };
  }

  // Recompute positions for affected location/date combos.
  // Use added_at as the immutable FIFO tiebreaker (not stale position values).
  const affectedCombos = new Set<string>();
  for (const row of expired) {
    affectedCombos.add(`${String(row.tenant_id)}|${String(row.location_id)}|${String(row.business_date)}`);
  }

  for (const combo of affectedCombos) {
    const [tenantId, locationId, businessDate] = combo.split('|');
    await adminDb.execute(sql`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY priority DESC, added_at ASC) AS new_pos
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND business_date = ${businessDate}
          AND status IN ('waiting', 'notified')
      )
      UPDATE fnb_waitlist_entries e
      SET position = ranked.new_pos, updated_at = now()
      FROM ranked
      WHERE e.id = ranked.id AND e.position != ranked.new_pos
    `);
  }

  return {
    expiredCount: expired.length,
    expiredIds: expired.map((r) => String(r.id)),
  };
}
