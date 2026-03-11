import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

/**
 * Resolves the KDS-relevant site ID for a given location.
 *
 * KDS stations and routing rules are configured at the site level.
 * When a tab is opened at a venue (locationType='venue'), the tab stores
 * the venue's location ID. This helper resolves venue→parentLocationId
 * so that KDS routing, ticket creation, and station lookups all use the
 * correct site-level location.
 *
 * Returns the original locationId if it's already a site or lookup fails.
 */
export async function resolveKdsSiteId(
  tenantId: string,
  locationId: string,
): Promise<string> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.execute(
      sql`SELECT location_type, parent_location_id
          FROM locations
          WHERE id = ${locationId} AND tenant_id = ${tenantId}
          LIMIT 1`,
    ),
  );

  const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  if (!row) return locationId;

  if (row.location_type === 'venue' && typeof row.parent_location_id === 'string') {
    return row.parent_location_id;
  }

  return locationId;
}
