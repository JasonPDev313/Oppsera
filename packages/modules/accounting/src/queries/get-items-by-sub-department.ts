import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface SubDepartmentItem {
  id: string;
  sku: string | null;
  name: string;
  itemType: string;
  categoryName: string;
  defaultPrice: string;
}

interface GetItemsBySubDepartmentInput {
  tenantId: string;
  subDepartmentId: string;
  limit?: number;
  cursor?: string | null;
}

/**
 * Returns catalog items under the given mappable category.
 * Handles both hierarchy shapes:
 * - 3-level: items in child categories of this sub-department
 * - 2-level: items directly assigned to this category (department)
 */
export async function getItemsBySubDepartment(
  input: GetItemsBySubDepartmentInput,
): Promise<{ items: SubDepartmentItem[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const cursorCondition = input.cursor
      ? sql`AND ci.id < ${input.cursor}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        ci.id,
        ci.sku,
        ci.name,
        ci.item_type,
        cat.name AS category_name,
        ci.default_price
      FROM catalog_items ci
      JOIN catalog_categories cat ON cat.id = ci.category_id
      WHERE ci.tenant_id = ${input.tenantId}
        AND ci.archived_at IS NULL
        AND cat.is_active = true
        AND (cat.parent_id = ${input.subDepartmentId} OR cat.id = ${input.subDepartmentId})
        ${cursorCondition}
      ORDER BY ci.id DESC
      LIMIT ${limit + 1}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = arr.length > limit;
    const items = (hasMore ? arr.slice(0, limit) : arr).map((row) => ({
      id: String(row.id),
      sku: row.sku ? String(row.sku) : null,
      name: String(row.name),
      itemType: String(row.item_type),
      categoryName: String(row.category_name),
      defaultPrice: String(row.default_price),
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
