import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  type WaitlistConfigRow,
  mapWaitlistConfigRow,
  getDefaultWaitlistConfig,
} from '../services/waitlist-config';

export type { WaitlistConfigRow };

/**
 * Get waitlist config for a specific location.
 * Falls back to tenant-wide default (locationId = null) if no per-location config.
 * Returns sensible defaults if no config exists at all.
 */
export async function getWaitlistConfig(
  tenantId: string,
  locationId: string,
): Promise<WaitlistConfigRow> {
  return withTenant(tenantId, async (tx) => {
    // Try location-specific first, then tenant default
    const rows = await tx.execute(sql`
      SELECT *
      FROM fnb_waitlist_config
      WHERE tenant_id = ${tenantId}
        AND (location_id = ${locationId} OR location_id IS NULL)
      ORDER BY location_id IS NULL ASC
      LIMIT 1
    `);

    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];

    if (!row) {
      // Return an empty config with defaults
      const defaults = getDefaultWaitlistConfig();
      return {
        id: '',
        tenantId,
        locationId,
        enabled: false,
        slugOverride: null,
        ...defaults,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    return mapWaitlistConfigRow(row);
  });
}

/**
 * Get waitlist config by slug — for public routes.
 * Does NOT use withTenant (no RLS context in public routes).
 */
export async function getWaitlistConfigBySlug(
  db: { execute: (query: unknown) => Promise<unknown> },
  slug: string,
): Promise<(WaitlistConfigRow & { tenantName: string; locationName: string }) | null> {
  const rows = await db.execute(sql`
    SELECT wc.*, t.name AS tenant_name, l.name AS location_name
    FROM fnb_waitlist_config wc
    JOIN tenants t ON t.id = wc.tenant_id
    LEFT JOIN locations l ON l.id = wc.location_id
    WHERE wc.slug_override = ${slug}
      AND wc.enabled = true
      AND t.status = 'active'
    LIMIT 1
  `);

  const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  if (!row) return null;

  return {
    ...mapWaitlistConfigRow(row),
    tenantName: String(row.tenant_name),
    locationName: row.location_name ? String(row.location_name) : String(row.tenant_name),
  };
}
