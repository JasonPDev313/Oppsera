import { eq, and, asc, isNull } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { catalogItems, catalogCategories } from '../schema';

export interface POSCatalogItem {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  itemType: string;
  defaultPrice: string;
  isTrackable: boolean;
  metadata: Record<string, unknown> | null;
  categoryId: string | null;
}

export interface POSCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface POSCatalogResult {
  items: POSCatalogItem[];
  categories: POSCategory[];
}

/**
 * Lean POS catalog query — returns all active items + categories in one call.
 *
 * Compared to the generic listItems/listCategories queries:
 * - NO 3x LEFT JOIN for category hierarchy names (POS builds hierarchy client-side)
 * - NO COUNT JOIN for item counts (POS doesn't display them)
 * - NO cursor pagination (single query, POS loads all active items)
 * - Selects only the columns POS actually uses
 * - Both queries run in parallel within the same transaction
 */
export async function getCatalogForPOS(tenantId: string): Promise<POSCatalogResult> {
  return withTenant(tenantId, async (tx) => {
    const [items, categories] = await Promise.all([
      tx
        .select({
          id: catalogItems.id,
          name: catalogItems.name,
          sku: catalogItems.sku,
          barcode: catalogItems.barcode,
          itemType: catalogItems.itemType,
          defaultPrice: catalogItems.defaultPrice,
          isTrackable: catalogItems.isTrackable,
          metadata: catalogItems.metadata,
          categoryId: catalogItems.categoryId,
        })
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.tenantId, tenantId),
            isNull(catalogItems.archivedAt),
          ),
        ),
      tx
        .select({
          id: catalogCategories.id,
          name: catalogCategories.name,
          parentId: catalogCategories.parentId,
          sortOrder: catalogCategories.sortOrder,
        })
        .from(catalogCategories)
        .where(
          and(
            eq(catalogCategories.tenantId, tenantId),
            eq(catalogCategories.isActive, true),
          ),
        )
        .orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.name)),
    ]);

    return { items, categories };
  });
}
