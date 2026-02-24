/**
 * Get housekeeper workload summary for a business date.
 * Returns pending/in_progress/completed counts and avg duration per housekeeper.
 */
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface HousekeeperWorkload {
  housekeeperId: string;
  housekeeperName: string;
  pending: number;
  inProgress: number;
  completed: number;
  skipped: number;
  avgMinutes: number;
}

export async function getHousekeeperWorkload(
  tenantId: string,
  propertyId: string,
  businessDate: string,
): Promise<HousekeeperWorkload[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        h.id AS housekeeper_id,
        h.name AS housekeeper_name,
        COUNT(*) FILTER (WHERE a.status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE a.status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE a.status = 'skipped')::int AS skipped,
        COALESCE(AVG(a.duration_minutes) FILTER (WHERE a.status = 'completed'), 0)::int AS avg_minutes
      FROM pms_housekeepers h
      LEFT JOIN pms_housekeeping_assignments a
        ON a.housekeeper_id = h.id
        AND a.tenant_id = h.tenant_id
        AND a.business_date = ${businessDate}
        AND a.property_id = ${propertyId}
      WHERE h.tenant_id = ${tenantId}
        AND h.property_id = ${propertyId}
        AND h.is_active = true
      GROUP BY h.id, h.name
      ORDER BY h.name ASC
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      housekeeperId: String(row.housekeeper_id),
      housekeeperName: String(row.housekeeper_name),
      pending: Number(row.pending ?? 0),
      inProgress: Number(row.in_progress ?? 0),
      completed: Number(row.completed ?? 0),
      skipped: Number(row.skipped ?? 0),
      avgMinutes: Number(row.avg_minutes ?? 0),
    }));
  });
}
