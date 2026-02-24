import { eq, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { catalogModifierGroupCategories } from '../schema';

export interface ModifierGroupCategoryRow {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function listModifierGroupCategories(
  tenantId: string,
): Promise<ModifierGroupCategoryRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(catalogModifierGroupCategories)
      .where(eq(catalogModifierGroupCategories.tenantId, tenantId))
      .orderBy(
        asc(catalogModifierGroupCategories.sortOrder),
        asc(catalogModifierGroupCategories.name),
      );

    return rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      name: r.name,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  });
}
