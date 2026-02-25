import { db, locations } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { PortalSession } from './portal-auth';

// ── Location cache (module-level, 5-minute TTL) ──
const locationCache = new Map<string, { locationId: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveLocationId(tenantId: string): Promise<string> {
  const cached = locationCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.locationId;
  }

  const [row] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.tenantId, tenantId), eq(locations.isActive, true)))
    .limit(1);

  if (!row) {
    throw Object.assign(new Error('No active location found for tenant'), {
      code: 'NO_LOCATION',
      status: 422,
    });
  }

  locationCache.set(tenantId, { locationId: row.id, expiresAt: Date.now() + CACHE_TTL_MS });
  return row.id;
}

/**
 * Build a RequestContext for portal API routes.
 * Resolves a real locationId from the tenant's locations table (cached 5 min).
 * Uses `as any` because portal sessions don't have the full AuthUser shape —
 * same approach as existing bank-account routes.
 */
export async function buildPortalCtx(session: PortalSession) {
  const locationId = await resolveLocationId(session.tenantId);

  return {
    tenantId: session.tenantId,
    locationId,
    requestId: crypto.randomUUID(),
    isPlatformAdmin: false,
    user: {
      id: `customer:${session.customerId}`,
      email: session.email,
      name: session.email,
      tenantId: session.tenantId,
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
  } as any;
}
