import { eq, and, lt, asc, desc } from 'drizzle-orm';
import { withTenant, spaPackageDefinitions } from '@oppsera/db';

export interface ListPackageDefinitionsInput {
  tenantId: string;
  isActive?: boolean;
  packageType?: string;
  cursor?: string;
  limit?: number;
}

export interface PackageDefinitionRow {
  id: string;
  name: string;
  description: string | null;
  packageType: string;
  totalSessions: number | null;
  totalCredits: string | null;
  sellingPriceCents: number;
  validityDays: number;
  isTransferable: boolean;
  freezeAllowed: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface ListPackageDefinitionsResult {
  items: PackageDefinitionRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Returns paginated package definitions with cursor pagination.
 * Filters by isActive and packageType.
 * Order by sortOrder ASC, then id DESC.
 * Default limit 50.
 */
export async function listPackageDefinitions(
  input: ListPackageDefinitionsInput,
): Promise<ListPackageDefinitionsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(spaPackageDefinitions.tenantId, input.tenantId),
    ];

    if (input.cursor) {
      conditions.push(lt(spaPackageDefinitions.id, input.cursor));
    }

    if (input.isActive !== undefined) {
      conditions.push(eq(spaPackageDefinitions.isActive, input.isActive));
    }

    if (input.packageType) {
      conditions.push(eq(spaPackageDefinitions.packageType, input.packageType));
    }

    const rows = await tx
      .select({
        id: spaPackageDefinitions.id,
        name: spaPackageDefinitions.name,
        description: spaPackageDefinitions.description,
        packageType: spaPackageDefinitions.packageType,
        totalSessions: spaPackageDefinitions.totalSessions,
        totalCredits: spaPackageDefinitions.totalCredits,
        sellingPriceCents: spaPackageDefinitions.sellingPriceCents,
        validityDays: spaPackageDefinitions.validityDays,
        isTransferable: spaPackageDefinitions.isTransferable,
        freezeAllowed: spaPackageDefinitions.freezeAllowed,
        isActive: spaPackageDefinitions.isActive,
        sortOrder: spaPackageDefinitions.sortOrder,
        createdAt: spaPackageDefinitions.createdAt,
      })
      .from(spaPackageDefinitions)
      .where(and(...conditions))
      .orderBy(asc(spaPackageDefinitions.sortOrder), desc(spaPackageDefinitions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? sliced[sliced.length - 1]!.id : null;

    const items: PackageDefinitionRow[] = sliced.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      packageType: r.packageType,
      totalSessions: r.totalSessions ?? null,
      totalCredits: r.totalCredits ?? null,
      sellingPriceCents: r.sellingPriceCents,
      validityDays: r.validityDays,
      isTransferable: r.isTransferable,
      freezeAllowed: r.freezeAllowed,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
    }));

    return { items, cursor: nextCursor, hasMore };
  });
}
