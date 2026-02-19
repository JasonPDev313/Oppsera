import { eq, and, lt, gte, lte, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { users } from '@oppsera/db';
import { catalogItemChangeLogs, catalogCategories, taxCategories } from '../schema';
import type { ChangeLogEntry, FieldChange } from '../services/item-change-log';

export interface GetItemChangeLogInput {
  tenantId: string;
  itemId: string;
  cursor?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  actionType?: string;
  userId?: string;
}

export interface GetItemChangeLogResult {
  entries: ChangeLogEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getItemChangeLog(
  input: GetItemChangeLogInput,
): Promise<GetItemChangeLogResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(catalogItemChangeLogs.tenantId, input.tenantId),
      eq(catalogItemChangeLogs.itemId, input.itemId),
    ];

    if (input.cursor) {
      conditions.push(lt(catalogItemChangeLogs.id, input.cursor));
    }

    if (input.dateFrom) {
      conditions.push(gte(catalogItemChangeLogs.changedAt, new Date(input.dateFrom)));
    }

    if (input.dateTo) {
      conditions.push(lte(catalogItemChangeLogs.changedAt, new Date(input.dateTo)));
    }

    if (input.actionType) {
      conditions.push(eq(catalogItemChangeLogs.actionType, input.actionType));
    }

    if (input.userId) {
      conditions.push(eq(catalogItemChangeLogs.changedByUserId, input.userId));
    }

    const rows = await tx
      .select({
        id: catalogItemChangeLogs.id,
        itemId: catalogItemChangeLogs.itemId,
        actionType: catalogItemChangeLogs.actionType,
        changedByUserId: catalogItemChangeLogs.changedByUserId,
        changedByName: users.name,
        changedAt: catalogItemChangeLogs.changedAt,
        source: catalogItemChangeLogs.source,
        fieldChanges: catalogItemChangeLogs.fieldChanges,
        summary: catalogItemChangeLogs.summary,
        notes: catalogItemChangeLogs.notes,
      })
      .from(catalogItemChangeLogs)
      .leftJoin(users, eq(catalogItemChangeLogs.changedByUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(catalogItemChangeLogs.changedAt), desc(catalogItemChangeLogs.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    // Collect lookup IDs from fieldChanges for category/taxCategory resolution
    const categoryIds = new Set<string>();
    const taxCategoryIds = new Set<string>();

    for (const row of items) {
      const changes = row.fieldChanges as Record<string, FieldChange> | null;
      if (!changes) continue;
      if (changes.categoryId) {
        if (changes.categoryId.old) categoryIds.add(changes.categoryId.old as string);
        if (changes.categoryId.new) categoryIds.add(changes.categoryId.new as string);
      }
      if (changes.taxCategoryId) {
        if (changes.taxCategoryId.old) taxCategoryIds.add(changes.taxCategoryId.old as string);
        if (changes.taxCategoryId.new) taxCategoryIds.add(changes.taxCategoryId.new as string);
      }
    }

    // Batch-fetch lookup names
    const categoryMap = new Map<string, string>();
    if (categoryIds.size > 0) {
      const cats = await tx
        .select({ id: catalogCategories.id, name: catalogCategories.name })
        .from(catalogCategories)
        .where(eq(catalogCategories.tenantId, input.tenantId));
      for (const c of cats) {
        if (categoryIds.has(c.id)) categoryMap.set(c.id, c.name);
      }
    }

    const taxCategoryMap = new Map<string, string>();
    if (taxCategoryIds.size > 0) {
      const tcs = await tx
        .select({ id: taxCategories.id, name: taxCategories.name })
        .from(taxCategories)
        .where(eq(taxCategories.tenantId, input.tenantId));
      for (const tc of tcs) {
        if (taxCategoryIds.has(tc.id)) taxCategoryMap.set(tc.id, tc.name);
      }
    }

    // Map rows to entries with resolved display names
    const entries: ChangeLogEntry[] = items.map((row) => {
      const changes = (row.fieldChanges ?? {}) as Record<string, FieldChange>;

      // Inject display names for lookup fields
      if (changes.categoryId) {
        const oldId = changes.categoryId.old as string | null;
        const newId = changes.categoryId.new as string | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const catChange = changes.categoryId as any;
        catChange.oldDisplay = oldId ? (categoryMap.get(oldId) ?? null) : null;
        catChange.newDisplay = newId ? (categoryMap.get(newId) ?? null) : null;
      }
      if (changes.taxCategoryId) {
        const oldId = changes.taxCategoryId.old as string | null;
        const newId = changes.taxCategoryId.new as string | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tcChange = changes.taxCategoryId as any;
        tcChange.oldDisplay = oldId ? (taxCategoryMap.get(oldId) ?? null) : null;
        tcChange.newDisplay = newId ? (taxCategoryMap.get(newId) ?? null) : null;
      }

      return {
        id: row.id,
        itemId: row.itemId,
        actionType: row.actionType as ChangeLogEntry['actionType'],
        changedByUserId: row.changedByUserId,
        changedByName: row.changedByName ?? null,
        changedAt: row.changedAt.toISOString(),
        source: row.source as ChangeLogEntry['source'],
        fieldChanges: changes,
        summary: row.summary,
        notes: row.notes,
      };
    });

    return { entries, cursor: nextCursor, hasMore };
  });
}
