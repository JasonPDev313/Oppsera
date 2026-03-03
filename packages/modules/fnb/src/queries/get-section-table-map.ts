import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { SectionAssignment } from '../services/server-recommender';

export interface GetSectionTableMapInput {
  tenantId: string;
  locationId: string;
  businessDate: string;
}

/**
 * Build a section→server→tableIds mapping for active server assignments.
 *
 * Used by the recommend-server route to determine section affinity when
 * scoring servers for a given table.
 */
export async function getSectionTableMap(
  input: GetSectionTableMapInput,
): Promise<SectionAssignment[]> {
  return withTenant(input.tenantId, async (tx) => {
    // Get active server assignments with their section's table IDs
    const rows = await tx.execute(sql`
      SELECT
        a.section_id,
        a.server_user_id,
        COALESCE(
          ARRAY_AGG(t.id) FILTER (WHERE t.id IS NOT NULL),
          '{}'::text[]
        ) AS table_ids
      FROM fnb_server_assignments a
      LEFT JOIN fnb_tables t ON t.section_id = a.section_id
        AND t.tenant_id = a.tenant_id
        AND t.is_active = true
      WHERE a.tenant_id = ${input.tenantId}
        AND a.location_id = ${input.locationId}
        AND a.business_date = ${input.businessDate}
        AND a.status = 'active'
      GROUP BY a.section_id, a.server_user_id
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      sectionId: String(row.section_id),
      serverUserId: String(row.server_user_id),
      tableIds: (row.table_ids as string[]) ?? [],
    }));
  });
}
