import { eq, and } from 'drizzle-orm';
import { withTenant, spaResources } from '@oppsera/db';

export interface ResourceDetail {
  id: string;
  name: string;
  resourceType: string;
  description: string | null;
  capacity: number;
  locationId: string | null;
  bufferMinutes: number;
  cleanupMinutes: number;
  amenities: string[] | null;
  photoUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Returns a single spa resource by ID.
 * Returns null if not found.
 */
export async function getResource(
  tenantId: string,
  resourceId: string,
): Promise<ResourceDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        id: spaResources.id,
        name: spaResources.name,
        resourceType: spaResources.resourceType,
        description: spaResources.description,
        capacity: spaResources.capacity,
        locationId: spaResources.locationId,
        bufferMinutes: spaResources.bufferMinutes,
        cleanupMinutes: spaResources.cleanupMinutes,
        amenities: spaResources.amenities,
        photoUrl: spaResources.photoUrl,
        isActive: spaResources.isActive,
        sortOrder: spaResources.sortOrder,
        createdAt: spaResources.createdAt,
        updatedAt: spaResources.updatedAt,
      })
      .from(spaResources)
      .where(
        and(
          eq(spaResources.id, resourceId),
          eq(spaResources.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      resourceType: row.resourceType,
      description: row.description ?? null,
      capacity: row.capacity,
      locationId: row.locationId ?? null,
      bufferMinutes: row.bufferMinutes,
      cleanupMinutes: row.cleanupMinutes,
      amenities: row.amenities ?? null,
      photoUrl: row.photoUrl ?? null,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}
