import { eq, and, lt, ilike, or, desc, isNull, getTableColumns, sql, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { withTenant, inventoryItems, inventoryMovements } from '@oppsera/db';
import { catalogItems, catalogCategories } from '../schema';

export interface ListItemsInput {
  tenantId: string;
  cursor?: string;
  limit?: number;
  categoryId?: string;
  itemType?: string;
  search?: string;
  includeArchived?: boolean;
  /** Include on-hand, reorderPoint, etc. from inventory in same transaction */
  includeInventory?: boolean;
  /** Required when includeInventory is true */
  locationId?: string;
}

export interface ListItemRow extends Omit<typeof catalogItems.$inferSelect, 'metadata'> {
  metadata: Record<string, unknown> | null;
  categoryName: string | null;
  subDepartmentName: string | null;
  departmentName: string | null;
  // Inventory fields (populated when includeInventory=true)
  onHand?: number;
  reorderPoint?: string | null;
  baseUnit?: string;
  inventoryItemId?: string;
  inventoryStatus?: string;
}

export interface ListItemsResult {
  items: ListItemRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listItems(input: ListItemsInput): Promise<ListItemsResult> {
  const limit = Math.min(input.limit ?? 50, 5000);

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

    if (!input.includeArchived) {
      conditions.push(isNull(catalogItems.archivedAt));
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
    const items = (hasMore ? rows.slice(0, limit) : rows) as ListItemRow[];
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    // Optionally enrich with inventory data in same transaction
    if (input.includeInventory && input.locationId && items.length > 0) {
      const catalogIds = items.map((i) => i.id);

      // Batch-fetch inventory items for these catalog items
      const invRows = await tx
        .select({
          id: inventoryItems.id,
          catalogItemId: inventoryItems.catalogItemId,
          reorderPoint: inventoryItems.reorderPoint,
          baseUnit: inventoryItems.baseUnit,
          status: inventoryItems.status,
        })
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.tenantId, input.tenantId),
            eq(inventoryItems.locationId, input.locationId),
            inArray(inventoryItems.catalogItemId, catalogIds),
          ),
        );

      // Batch-compute on-hand for matched inventory items
      const invIds = invRows.map((r) => r.id);
      const onHandMap = new Map<string, number>();

      if (invIds.length > 0) {
        const ohRows = await tx.execute(
          sql`SELECT inventory_item_id, COALESCE(SUM(quantity_delta), 0)::int AS on_hand
              FROM inventory_movements
              WHERE tenant_id = ${input.tenantId}
                AND inventory_item_id IN ${sql`(${sql.join(invIds.map((id) => sql`${id}`), sql`, `)})`}
              GROUP BY inventory_item_id`,
        );
        for (const r of Array.from(ohRows as Iterable<{ inventory_item_id: string; on_hand: number }>)) {
          onHandMap.set(r.inventory_item_id, Number(r.on_hand));
        }
      }

      // Build catalogItemId → inventory data lookup
      const invMap = new Map<string, { id: string; reorderPoint: string | null; baseUnit: string; status: string; onHand: number }>();
      for (const inv of invRows) {
        invMap.set(inv.catalogItemId, {
          id: inv.id,
          reorderPoint: inv.reorderPoint,
          baseUnit: inv.baseUnit,
          status: inv.status,
          onHand: onHandMap.get(inv.id) ?? 0,
        });
      }

      // Enrich items
      for (const item of items) {
        const inv = invMap.get(item.id);
        if (inv) {
          item.inventoryItemId = inv.id;
          item.reorderPoint = inv.reorderPoint;
          item.baseUnit = inv.baseUnit;
          item.inventoryStatus = inv.status;
          item.onHand = inv.onHand;
        }
      }
    }

    return { items, cursor: nextCursor, hasMore };
  });
}
