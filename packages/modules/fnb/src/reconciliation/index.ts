import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

// ── getFnbCloseStatus ──────────────────────────────────────────
/**
 * Counts F&B close batches in a posting period and how many are not yet posted.
 * Used by the accounting close checklist.
 */
export async function getFnbCloseStatus(
  tenantId: string,
  period: string,
): Promise<{ total: number; unposted: number }> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('posted', 'locked'))::int AS unposted
      FROM fnb_close_batches
      WHERE tenant_id = ${tenantId}
        AND business_date >= (${period} || '-01')::date
        AND business_date < ((${period} || '-01')::date + INTERVAL '1 month')
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return {
      total: arr.length > 0 ? Number(arr[0]!.total) : 0,
      unposted: arr.length > 0 ? Number(arr[0]!.unposted) : 0,
    };
  });
}
