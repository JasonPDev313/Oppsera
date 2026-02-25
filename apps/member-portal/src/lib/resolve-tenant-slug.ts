import { db, tenants } from '@oppsera/db';
import { eq } from 'drizzle-orm';

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
}

// Simple in-memory cache: slug → { tenant | null, expiresAt }
const cache = new Map<string, { tenant: TenantInfo | null; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_CACHE_TTL_MS = 60 * 1000; // 1 minute for "not found" slugs
const QUERY_TIMEOUT_MS = 5_000; // 5 seconds max for DB query

export async function resolveTenantSlug(slug: string): Promise<TenantInfo | null> {
  // Basic slug validation — skip DB entirely for obviously invalid slugs
  if (!slug || slug.length > 100 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return null;
  }

  const now = Date.now();
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > now) {
    return cached.tenant;
  }

  try {
    const queryPromise = db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Tenant lookup timed out')), QUERY_TIMEOUT_MS),
    );

    const [row] = await Promise.race([queryPromise, timeoutPromise]);

    if (!row) {
      // Cache negative result so we don't re-query invalid slugs every request
      cache.set(slug, { tenant: null, expiresAt: now + NEGATIVE_CACHE_TTL_MS });
      return null;
    }

    const tenant: TenantInfo = {
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
    };

    cache.set(slug, { tenant, expiresAt: now + CACHE_TTL_MS });
    return tenant;
  } catch (err) {
    console.error('resolveTenantSlug error:', err);
    // On timeout or DB error, return null so the page renders a 404
    // rather than hanging forever
    return null;
  }
}
