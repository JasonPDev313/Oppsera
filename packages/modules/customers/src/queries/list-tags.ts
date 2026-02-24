import { eq, and, desc, isNull, isNotNull, ilike, or, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tags } from '@oppsera/db';

export interface ListTagsInput {
  tenantId: string;
  tagType?: 'manual' | 'smart';
  category?: string;
  isActive?: boolean;
  includeArchived?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface TagListItem {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string | null;
  tagType: string;
  category: string | null;
  isActive: boolean;
  isSystem: boolean;
  displayOrder: number;
  customerCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  archivedAt: Date | null;
}

export interface ListTagsResult {
  items: TagListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listTags(input: ListTagsInput): Promise<ListTagsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(tags.tenantId, input.tenantId)];

    if (!input.includeArchived) {
      conditions.push(isNull(tags.archivedAt));
    }

    if (input.tagType) {
      conditions.push(eq(tags.tagType, input.tagType));
    }

    if (input.category) {
      conditions.push(eq(tags.category, input.category));
    }

    if (input.isActive !== undefined) {
      conditions.push(eq(tags.isActive, input.isActive));
    }

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(
        or(
          ilike(tags.name, pattern),
          ilike(tags.slug, pattern),
        )!,
      );
    }

    if (input.cursor) {
      conditions.push(sql`${tags.id} < ${input.cursor}`);
    }

    const rows = await (tx as any)
      .select({
        id: tags.id,
        tenantId: tags.tenantId,
        name: tags.name,
        slug: tags.slug,
        description: tags.description,
        color: tags.color,
        icon: tags.icon,
        tagType: tags.tagType,
        category: tags.category,
        isActive: tags.isActive,
        isSystem: tags.isSystem,
        displayOrder: tags.displayOrder,
        customerCount: tags.customerCount,
        createdAt: tags.createdAt,
        updatedAt: tags.updatedAt,
        createdBy: tags.createdBy,
        archivedAt: tags.archivedAt,
      })
      .from(tags)
      .where(and(...conditions))
      .orderBy(desc(tags.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
