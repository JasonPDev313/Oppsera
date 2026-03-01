import { eq, and, asc, sql, isNull } from 'drizzle-orm';
import { withTenant, spaServiceCategories, spaServices } from '@oppsera/db';

export interface ServiceCategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  serviceCount: number;
}

/**
 * Returns all service categories for a tenant, ordered by sortOrder.
 * Flat list — frontend builds tree from parentCategoryId.
 * Includes serviceCount (active services in each category).
 */
export async function listServiceCategories(
  tenantId: string,
  _locationId?: string,
): Promise<ServiceCategoryRow[]> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [eq(spaServiceCategories.tenantId, tenantId)];

    const rows = await tx
      .select({
        id: spaServiceCategories.id,
        name: spaServiceCategories.name,
        parentId: spaServiceCategories.parentId,
        description: spaServiceCategories.description,
        icon: spaServiceCategories.icon,
        sortOrder: spaServiceCategories.sortOrder,
        isActive: spaServiceCategories.isActive,
        createdAt: spaServiceCategories.createdAt,
        updatedAt: spaServiceCategories.updatedAt,
        serviceCount: sql<number>`count(${spaServices.id})::int`,
      })
      .from(spaServiceCategories)
      .leftJoin(
        spaServices,
        and(
          eq(spaServices.categoryId, spaServiceCategories.id),
          isNull(spaServices.archivedAt),
          eq(spaServices.isActive, true),
        ),
      )
      .where(and(...conditions))
      .groupBy(spaServiceCategories.id)
      .orderBy(asc(spaServiceCategories.sortOrder), asc(spaServiceCategories.name));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId ?? null,
      description: r.description ?? null,
      icon: r.icon ?? null,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      serviceCount: r.serviceCount,
    }));
  });
}
