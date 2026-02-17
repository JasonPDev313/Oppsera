import { eq, and, lt, ilike, or, desc, getTableColumns } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { withTenant } from '@oppsera/db';
import { catalogItems, catalogCategories } from '../schema';

export interface ListItemsInput {
  tenantId: string;
  cursor?: string;
  limit?: number;
  categoryId?: string;
  itemType?: string;
  isActive?: boolean;
  search?: string;
}

export interface ListItemRow extends Omit<typeof catalogItems.$inferSelect, 'metadata'> {
  metadata: Record<string, unknown> | null;
  categoryName: string | null;
  subDepartmentName: string | null;
  departmentName: string | null;
}

export interface ListItemsResult {
  items: ListItemRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listItems(input: ListItemsInput): Promise<ListItemsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(catalogItems.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(lt(catalogItems.id, input.cursor));
    }

    if (input.categoryId) {
      conditions.push(eq(catalogItems.categoryId, input.categoryId));
    }

    if (input.itemType) {
      conditions.push(eq(catalogItems.itemType, input.itemType));
    }

    if (input.isActive !== undefined) {
      conditions.push(eq(catalogItems.isActive, input.isActive));
    }

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(
        or(ilike(catalogItems.name, pattern), ilike(catalogItems.sku, pattern))!,
      );
    }

    // Self-join aliases for the 3-level category hierarchy:
    // Item → Category (leaf) → SubDepartment → Department
    const cat = alias(catalogCategories, 'cat');
    const subDept = alias(catalogCategories, 'sub_dept');
    const dept = alias(catalogCategories, 'dept');

    const itemCols = getTableColumns(catalogItems);

    const rows = await tx
      .select({
        ...itemCols,
        categoryName: cat.name,
        subDepartmentName: subDept.name,
        departmentName: dept.name,
      })
      .from(catalogItems)
      .leftJoin(cat, eq(catalogItems.categoryId, cat.id))
      .leftJoin(subDept, eq(cat.parentId, subDept.id))
      .leftJoin(dept, eq(subDept.parentId, dept.id))
      .where(and(...conditions))
      .orderBy(desc(catalogItems.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items: items as ListItemRow[], cursor: nextCursor, hasMore };
  });
}
