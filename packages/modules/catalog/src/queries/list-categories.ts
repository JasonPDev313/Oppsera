import { eq, and, sql, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { catalogCategories, catalogItems } from '../schema';

export interface CategoryWithCount {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
}

export async function listCategories(
  tenantId: string,
  includeInactive = false,
): Promise<CategoryWithCount[]> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [eq(catalogCategories.tenantId, tenantId)];
    if (!includeInactive) {
      conditions.push(eq(catalogCategories.isActive, true));
    }

    const rows = await tx
      .select({
        id: catalogCategories.id,
        parentId: catalogCategories.parentId,
        name: catalogCategories.name,
        sortOrder: catalogCategories.sortOrder,
        isActive: catalogCategories.isActive,
        createdAt: catalogCategories.createdAt,
        updatedAt: catalogCategories.updatedAt,
        itemCount: sql<number>`count(${catalogItems.id})::int`,
      })
      .from(catalogCategories)
      .leftJoin(
        catalogItems,
        and(
          eq(catalogItems.categoryId, catalogCategories.id),
          eq(catalogItems.isActive, true),
        ),
      )
      .where(and(...conditions))
      .groupBy(catalogCategories.id)
      .orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.name));

    return rows;
  });
}
