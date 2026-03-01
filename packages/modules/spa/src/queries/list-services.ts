import { eq, and, lt, ilike, or, desc, asc, isNull, isNotNull } from 'drizzle-orm';
import { withTenant, spaServices, spaServiceCategories } from '@oppsera/db';

export interface ListServicesInput {
  tenantId: string;
  locationId?: string;
  categoryId?: string;
  status?: 'active' | 'archived' | 'all';
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ServiceListRow {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  category: string;
  categoryId: string | null;
  categoryName: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  price: string;
  memberPrice: string | null;
  peakPrice: string | null;
  maxCapacity: number;
  isCouples: boolean;
  isGroup: boolean;
  requiresIntake: boolean;
  requiresConsent: boolean;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListServicesResult {
  items: ServiceListRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Returns paginated services with cursor pagination.
 * Filters by category, status (active = archivedAt IS NULL), search (name ILIKE).
 * Includes category name via LEFT JOIN.
 * Order by sortOrder ASC, then createdAt DESC.
 */
export async function listServices(input: ListServicesInput): Promise<ListServicesResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(spaServices.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(lt(spaServices.id, input.cursor));
    }

    if (input.categoryId) {
      conditions.push(eq(spaServices.categoryId, input.categoryId));
    }

    // Status filter: active = archivedAt IS NULL, archived = archivedAt IS NOT NULL
    const status = input.status ?? 'active';
    if (status === 'active') {
      conditions.push(isNull(spaServices.archivedAt));
    } else if (status === 'archived') {
      conditions.push(isNotNull(spaServices.archivedAt));
    }
    // 'all' — no status filter

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(
        or(
          ilike(spaServices.name, pattern),
          ilike(spaServices.displayName, pattern),
        )!,
      );
    }

    const rows = await tx
      .select({
        id: spaServices.id,
        name: spaServices.name,
        displayName: spaServices.displayName,
        description: spaServices.description,
        category: spaServices.category,
        categoryId: spaServices.categoryId,
        categoryName: spaServiceCategories.name,
        durationMinutes: spaServices.durationMinutes,
        bufferMinutes: spaServices.bufferMinutes,
        price: spaServices.price,
        memberPrice: spaServices.memberPrice,
        peakPrice: spaServices.peakPrice,
        maxCapacity: spaServices.maxCapacity,
        isCouples: spaServices.isCouples,
        isGroup: spaServices.isGroup,
        requiresIntake: spaServices.requiresIntake,
        requiresConsent: spaServices.requiresConsent,
        imageUrl: spaServices.imageUrl,
        sortOrder: spaServices.sortOrder,
        isActive: spaServices.isActive,
        archivedAt: spaServices.archivedAt,
        createdAt: spaServices.createdAt,
        updatedAt: spaServices.updatedAt,
      })
      .from(spaServices)
      .leftJoin(spaServiceCategories, eq(spaServices.categoryId, spaServiceCategories.id))
      .where(and(...conditions))
      .orderBy(asc(spaServices.sortOrder), desc(spaServices.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? sliced[sliced.length - 1]!.id : null;

    const items: ServiceListRow[] = sliced.map((r) => ({
      id: r.id,
      name: r.name,
      displayName: r.displayName ?? null,
      description: r.description ?? null,
      category: r.category,
      categoryId: r.categoryId ?? null,
      categoryName: r.categoryName ?? null,
      durationMinutes: r.durationMinutes,
      bufferMinutes: r.bufferMinutes,
      price: r.price,
      memberPrice: r.memberPrice ?? null,
      peakPrice: r.peakPrice ?? null,
      maxCapacity: r.maxCapacity,
      isCouples: r.isCouples,
      isGroup: r.isGroup,
      requiresIntake: r.requiresIntake,
      requiresConsent: r.requiresConsent,
      imageUrl: r.imageUrl ?? null,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      archivedAt: r.archivedAt ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return { items, cursor: nextCursor, hasMore };
  });
}
