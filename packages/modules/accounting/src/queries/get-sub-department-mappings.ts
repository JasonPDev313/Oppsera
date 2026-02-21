import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface SubDepartmentMappingRow {
  subDepartmentId: string;
  subDepartmentName: string;
  departmentId: string;
  departmentName: string;
  itemCount: number;
  revenueAccountId: string | null;
  revenueAccountDisplay: string | null;
  cogsAccountId: string | null;
  cogsAccountDisplay: string | null;
  inventoryAssetAccountId: string | null;
  inventoryAssetAccountDisplay: string | null;
  discountAccountId: string | null;
  discountAccountDisplay: string | null;
  returnsAccountId: string | null;
  returnsAccountDisplay: string | null;
}

interface GetSubDepartmentMappingsInput {
  tenantId: string;
}

/**
 * Returns all mappable categories for the tenant, LEFT JOINed with
 * their GL default mappings + account display names.
 *
 * Handles both 2-level and 3-level catalog hierarchies:
 * - 3-level: Department → SubDepartment → Category → Items
 *   → mappable entity = SubDepartment (depth-1), grouped by Department
 * - 2-level: Department → Items (items assigned directly to root categories)
 *   → mappable entity = Department itself, self-grouped
 *
 * The "mappable entity" is the parent of the item's category, or the
 * item's own category when it has no parent (root category).
 */
export async function getSubDepartmentMappings(
  input: GetSubDepartmentMappingsInput,
): Promise<SubDepartmentMappingRow[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      WITH all_cats AS (
        SELECT id, name, parent_id
        FROM catalog_categories
        WHERE tenant_id = ${input.tenantId}
          AND is_active = true
      ),
      -- Categories that items are directly assigned to
      item_cats AS (
        SELECT DISTINCT ci.category_id
        FROM catalog_items ci
        WHERE ci.tenant_id = ${input.tenantId}
          AND ci.archived_at IS NULL
      ),
      -- The mappable entity: parent of item's category, or the category itself if root
      mappable_ids AS (
        SELECT DISTINCT COALESCE(ac.parent_id, ac.id) AS id
        FROM item_cats ic
        JOIN all_cats ac ON ac.id = ic.category_id
      ),
      mappable AS (
        SELECT ac.id, ac.name, ac.parent_id
        FROM all_cats ac
        WHERE ac.id IN (SELECT id FROM mappable_ids)
      ),
      -- Count items: direct children OR items in child categories
      item_counts AS (
        SELECT m.id AS mappable_id, COUNT(DISTINCT ci.id)::int AS item_count
        FROM mappable m
        LEFT JOIN all_cats child ON child.parent_id = m.id
        LEFT JOIN catalog_items ci
          ON ci.tenant_id = ${input.tenantId}
          AND ci.archived_at IS NULL
          AND (ci.category_id = child.id OR ci.category_id = m.id)
        GROUP BY m.id
      )
      SELECT
        m.id AS sub_department_id,
        m.name AS sub_department_name,
        COALESCE(parent.id, m.id) AS department_id,
        COALESCE(parent.name, m.name) AS department_name,
        COALESCE(ic.item_count, 0) AS item_count,
        sdd.revenue_account_id,
        CASE WHEN ra.id IS NOT NULL THEN ra.account_number || ' — ' || ra.name END AS revenue_account_display,
        sdd.cogs_account_id,
        CASE WHEN ca.id IS NOT NULL THEN ca.account_number || ' — ' || ca.name END AS cogs_account_display,
        sdd.inventory_asset_account_id,
        CASE WHEN ia.id IS NOT NULL THEN ia.account_number || ' — ' || ia.name END AS inventory_asset_account_display,
        sdd.discount_account_id,
        CASE WHEN da.id IS NOT NULL THEN da.account_number || ' — ' || da.name END AS discount_account_display,
        sdd.returns_account_id,
        CASE WHEN rta.id IS NOT NULL THEN rta.account_number || ' — ' || rta.name END AS returns_account_display
      FROM mappable m
      LEFT JOIN all_cats parent ON parent.id = m.parent_id
      LEFT JOIN item_counts ic ON ic.mappable_id = m.id
      LEFT JOIN sub_department_gl_defaults sdd
        ON sdd.tenant_id = ${input.tenantId} AND sdd.sub_department_id = m.id
      LEFT JOIN gl_accounts ra ON ra.id = sdd.revenue_account_id
      LEFT JOIN gl_accounts ca ON ca.id = sdd.cogs_account_id
      LEFT JOIN gl_accounts ia ON ia.id = sdd.inventory_asset_account_id
      LEFT JOIN gl_accounts da ON da.id = sdd.discount_account_id
      LEFT JOIN gl_accounts rta ON rta.id = sdd.returns_account_id
      ORDER BY COALESCE(parent.name, m.name), m.name
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      subDepartmentId: String(row.sub_department_id),
      subDepartmentName: String(row.sub_department_name),
      departmentId: String(row.department_id),
      departmentName: String(row.department_name),
      itemCount: Number(row.item_count),
      revenueAccountId: row.revenue_account_id ? String(row.revenue_account_id) : null,
      revenueAccountDisplay: row.revenue_account_display ? String(row.revenue_account_display) : null,
      cogsAccountId: row.cogs_account_id ? String(row.cogs_account_id) : null,
      cogsAccountDisplay: row.cogs_account_display ? String(row.cogs_account_display) : null,
      inventoryAssetAccountId: row.inventory_asset_account_id ? String(row.inventory_asset_account_id) : null,
      inventoryAssetAccountDisplay: row.inventory_asset_account_display ? String(row.inventory_asset_account_display) : null,
      discountAccountId: row.discount_account_id ? String(row.discount_account_id) : null,
      discountAccountDisplay: row.discount_account_display ? String(row.discount_account_display) : null,
      returnsAccountId: row.returns_account_id ? String(row.returns_account_id) : null,
      returnsAccountDisplay: row.returns_account_display ? String(row.returns_account_display) : null,
    }));
  });
}
