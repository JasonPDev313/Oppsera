import { createAdminClient } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { mapWaitlistConfigRow } from '@oppsera/module-fnb';
import type { WaitlistConfigRow } from '@oppsera/module-fnb';

/**
 * Resolves a tenant for the public waitlist by slug or waitlist slug override.
 *
 * Lookup order:
 * 1. Try `fnb_waitlist_config.slug_override` (vanity slug, e.g., "joes-grill")
 * 2. Fall back to `tenants.slug` (tenant-level slug)
 *
 * Returns null if tenant doesn't exist, is not active, or waitlist is not enabled.
 *
 * Runs OUTSIDE withTenant() — public routes have no RLS context.
 */
export interface ResolvedWaitlistTenant {
  tenantId: string;
  tenantName: string;
  locationId: string;
  locationName: string;
  config: WaitlistConfigRow;
}

export async function resolveWaitlistTenant(
  slug: string,
): Promise<ResolvedWaitlistTenant | null> {
  const adminDb = createAdminClient();

  // 1. Try slug_override on fnb_waitlist_config
  const configRows = await adminDb.execute(sql`
    SELECT wc.*, t.name AS tenant_name, l.name AS location_name
    FROM fnb_waitlist_config wc
    JOIN tenants t ON t.id = wc.tenant_id
    JOIN locations l ON l.id = wc.location_id
    WHERE wc.slug_override = ${slug}
      AND wc.enabled = true
      AND t.status = 'active'
      AND l.is_active = true
    LIMIT 1
  `);

  let row = Array.from(configRows as Iterable<Record<string, unknown>>)[0];

  // 2. Fall back to tenant slug
  if (!row) {
    const tenantRows = await adminDb.execute(sql`
      SELECT wc.*, t.name AS tenant_name, l.name AS location_name
      FROM tenants t
      JOIN fnb_waitlist_config wc ON wc.tenant_id = t.id
      JOIN locations l ON l.id = wc.location_id
      WHERE t.slug = ${slug}
        AND wc.enabled = true
        AND t.status = 'active'
        AND l.is_active = true
      ORDER BY wc.created_at ASC
      LIMIT 1
    `);
    row = Array.from(tenantRows as Iterable<Record<string, unknown>>)[0];
  }

  if (!row) return null;

  return {
    tenantId: String(row.tenant_id),
    tenantName: String(row.tenant_name),
    locationId: String(row.location_id),
    locationName: String(row.location_name),
    config: mapWaitlistConfigRow(row),
  };
}
