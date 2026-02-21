import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsProperties, locations } from '@oppsera/db';

/**
 * Auto-creates PMS properties from the tenant's locations when none exist.
 * Falls back to creating a single property using fallbackName if no locations exist.
 * The caller should resolve the tenant name OUTSIDE withTenant to avoid RLS issues.
 * Returns the newly created property IDs, or empty array if properties already exist.
 */
export async function bootstrapPropertiesFromLocations(
  tenantId: string,
  fallbackName?: string,
): Promise<string[]> {
  return withTenant(tenantId, async (tx) => {
    // Check if any PMS properties already exist
    const existing = await tx
      .select({ id: pmsProperties.id })
      .from(pmsProperties)
      .where(eq(pmsProperties.tenantId, tenantId))
      .limit(1);

    if (existing.length > 0) return [];

    // Fetch active locations for this tenant
    const locs = await tx
      .select({
        id: locations.id,
        name: locations.name,
        timezone: locations.timezone,
      })
      .from(locations)
      .where(
        and(
          eq(locations.tenantId, tenantId),
          eq(locations.isActive, true),
        ),
      );

    if (locs.length > 0) {
      // Create a PMS property for each location
      const created = await tx
        .insert(pmsProperties)
        .values(
          locs.map((loc) => ({
            tenantId,
            name: loc.name,
            timezone: loc.timezone,
          })),
        )
        .returning({ id: pmsProperties.id });

      return created.map((r) => r.id);
    }

    // No locations found — create a default property using the provided name
    const propertyName = fallbackName || 'Default Property';

    const created = await tx
      .insert(pmsProperties)
      .values([{
        tenantId,
        name: propertyName,
        timezone: 'America/New_York',
      }])
      .returning({ id: pmsProperties.id });

    return created.map((r) => r.id);
  });
}
