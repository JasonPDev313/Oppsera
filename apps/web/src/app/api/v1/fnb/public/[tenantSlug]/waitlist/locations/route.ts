import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS, rateLimitHeaders } from '@oppsera/core/security';

/**
 * GET /api/v1/fnb/public/[tenantSlug]/waitlist/locations
 *
 * Returns all waitlist-enabled locations for a tenant.
 * Used for multi-location waitlist — guest picks their preferred location.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;

  const rlKey = getRateLimitKey(req, 'wl-locations');
  const rl = checkRateLimit(rlKey, RATE_LIMITS.publicRead);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    const adminDb = createAdminClient();

    // Resolve tenant from slug
    const tenantRows = await adminDb.execute(sql`
      SELECT t.id AS tenant_id, t.name AS tenant_name
      FROM tenants t
      WHERE t.slug = ${tenantSlug}
        AND t.status = 'active'
      LIMIT 1
    `);
    const tenant = Array.from(tenantRows as Iterable<Record<string, unknown>>)[0];
    if (!tenant) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Not found' } },
        { status: 404 },
      );
    }
    const tenantId = String(tenant.tenant_id);

    // Get all waitlist-enabled locations
    const rows = await adminDb.execute(sql`
      SELECT
        l.id AS location_id,
        l.name AS location_name,
        l.address_line1,
        l.city,
        l.state,
        wc.slug_override
      FROM fnb_waitlist_config wc
      JOIN locations l ON l.id = wc.location_id AND l.tenant_id = wc.tenant_id
      WHERE wc.tenant_id = ${tenantId}
        AND wc.enabled = true
        AND wc.location_id IS NOT NULL
        AND l.is_active = true
      ORDER BY l.name ASC
    `);

    // Build locations list. The first location without a slug_override gets the
    // tenant slug as its effective slug (matches resolveWaitlistTenant fallback
    // which picks the earliest config). Subsequent locations without overrides
    // are excluded — they MUST have a slug_override to be independently reachable.
    let defaultSlugAssigned = false;
    const locations: { locationId: string; name: string; address: string | null; city: string | null; state: string | null; slug: string }[] = [];

    for (const row of Array.from(rows as Iterable<Record<string, unknown>>)) {
      if (row.slug_override) {
        locations.push({
          locationId: String(row.location_id),
          name: String(row.location_name),
          address: row.address_line1 ? String(row.address_line1) : null,
          city: row.city ? String(row.city) : null,
          state: row.state ? String(row.state) : null,
          slug: String(row.slug_override),
        });
      } else if (!defaultSlugAssigned) {
        // First location without override gets the tenant slug
        defaultSlugAssigned = true;
        locations.push({
          locationId: String(row.location_id),
          name: String(row.location_name),
          address: row.address_line1 ? String(row.address_line1) : null,
          city: row.city ? String(row.city) : null,
          state: row.state ? String(row.state) : null,
          slug: tenantSlug,
        });
      }
      // Locations without slug_override after the first are skipped —
      // they need a slug_override to be independently addressable.
    }

    return NextResponse.json({
      data: {
        tenantName: String(tenant.tenant_name),
        locations,
      },
    }, { headers: rateLimitHeaders(rl) });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to load locations' } },
      { status: 500 },
    );
  }
}
