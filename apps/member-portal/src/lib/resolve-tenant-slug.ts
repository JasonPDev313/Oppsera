import { db, tenants } from '@oppsera/db';
import { eq } from 'drizzle-orm';

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
}

// Simple in-memory cache: slug → { tenant, expiresAt }
const cache = new Map<string, { tenant: TenantInfo; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function resolveTenantSlug(slug: string): Promise<TenantInfo | null> {
  const now = Date.now();
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > now) {
    return cached.tenant;
  }

  const [row] = await db
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (!row) {
    return null;
  }

  const tenant: TenantInfo = {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
  };

  cache.set(slug, { tenant, expiresAt: now + CACHE_TTL_MS });
  return tenant;
}
