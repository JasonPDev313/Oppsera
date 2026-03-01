import { eq, and } from 'drizzle-orm';
import { withTenant, spaSettings } from '@oppsera/db';

/**
 * Fetch spa settings for a tenant, optionally scoped to a location.
 * Returns null if no settings row exists.
 */
export async function getSpaSettings(tenantId: string, locationId?: string) {
  return withTenant(tenantId, async (tx) => {
    const conditions = [eq(spaSettings.tenantId, tenantId)];
    if (locationId) {
      conditions.push(eq(spaSettings.locationId, locationId));
    }

    const [settings] = await tx
      .select()
      .from(spaSettings)
      .where(and(...conditions))
      .limit(1);

    return settings ?? null;
  });
}
