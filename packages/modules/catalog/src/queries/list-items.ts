import { eq, and, lt, ilike, or, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { catalogItems } from '../schema';

export interface ListItemsInput {
  tenantId: string;
  cursor?: string;
  limit?: number;
  categoryId?: string;
  itemType?: string;
  isActive?: boolean;
  search?: string;
}

export interface ListItemsResult {
  items: (typeof catalogItems.$inferSelect)[];
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

    const rows = await tx
      .select()
      .from(catalogItems)
      .where(and(...conditions))
      .orderBy(desc(catalogItems.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
