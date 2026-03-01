import { eq, and, lt, ilike, desc } from 'drizzle-orm';
import { withTenant, spaResources } from '@oppsera/db';

export interface ListResourcesInput {
  tenantId: string;
  locationId?: string;
  resourceType?: 'room' | 'equipment' | 'bed' | 'chair' | 'other';
  isActive?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ResourceListRow {
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

export interface ListResourcesResult {
  items: ResourceListRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Returns paginated spa resources with cursor pagination.
 * Filters by resourceType, isActive, locationId, search (name ILIKE).
 * Order by id DESC (newest first).
 */
export async function listResources(input: ListResourcesInput): Promise<ListResourcesResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(spaResources.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(lt(spaResources.id, input.cursor));
    }

    if (input.locationId) {
      conditions.push(eq(spaResources.locationId, input.locationId));
    }

    if (input.resourceType) {
      conditions.push(eq(spaResources.resourceType, input.resourceType));
    }

    if (input.isActive !== undefined) {
      conditions.push(eq(spaResources.isActive, input.isActive));
    }

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(ilike(spaResources.name, pattern));
    }

    const rows = await tx
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
      .where(and(...conditions))
      .orderBy(desc(spaResources.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? sliced[sliced.length - 1]!.id : null;

    const items: ResourceListRow[] = sliced.map((r) => ({
      id: r.id,
      name: r.name,
      resourceType: r.resourceType,
      description: r.description ?? null,
      capacity: r.capacity,
      locationId: r.locationId ?? null,
      bufferMinutes: r.bufferMinutes,
      cleanupMinutes: r.cleanupMinutes,
      amenities: r.amenities ?? null,
      photoUrl: r.photoUrl ?? null,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return { items, cursor: nextCursor, hasMore };
  });
}
