import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant, spaPackageBalances, spaPackageDefinitions } from '@oppsera/db';

export interface ListCustomerPackagesInput {
  tenantId: string;
  customerId: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface CustomerPackageRow {
  id: string;
  customerId: string;
  packageDefId: string;
  packageName: string | null;
  packageType: string | null;
  purchaseDate: string;
  expirationDate: string;
  sessionsTotal: number | null;
  sessionsUsed: number;
  sessionsRemaining: number | null;
  creditsTotal: string | null;
  creditsUsed: string;
  creditsRemaining: number | null;
  status: string;
  frozenAt: Date | null;
  createdAt: Date;
}

export interface ListCustomerPackagesResult {
  items: CustomerPackageRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Returns paginated customer package balances with cursor pagination.
 * LEFT JOINs spaPackageDefinitions for packageName and packageType.
 * Computes sessionsRemaining and creditsRemaining.
 * Filters by balance status.
 * Order by createdAt DESC. Default limit 20.
 */
export async function listCustomerPackages(
  input: ListCustomerPackagesInput,
): Promise<ListCustomerPackagesResult> {
  const limit = Math.min(input.limit ?? 20, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(spaPackageBalances.tenantId, input.tenantId),
      eq(spaPackageBalances.customerId, input.customerId),
    ];

    if (input.cursor) {
      conditions.push(lt(spaPackageBalances.id, input.cursor));
    }

    if (input.status) {
      conditions.push(eq(spaPackageBalances.status, input.status));
    }

    const rows = await tx
      .select({
        id: spaPackageBalances.id,
        customerId: spaPackageBalances.customerId,
        packageDefId: spaPackageBalances.packageDefId,
        packageName: spaPackageDefinitions.name,
        packageType: spaPackageDefinitions.packageType,
        purchaseDate: spaPackageBalances.purchaseDate,
        expirationDate: spaPackageBalances.expirationDate,
        sessionsTotal: spaPackageBalances.sessionsTotal,
        sessionsUsed: spaPackageBalances.sessionsUsed,
        creditsTotal: spaPackageBalances.creditsTotal,
        creditsUsed: spaPackageBalances.creditsUsed,
        status: spaPackageBalances.status,
        frozenAt: spaPackageBalances.frozenAt,
        createdAt: spaPackageBalances.createdAt,
      })
      .from(spaPackageBalances)
      .leftJoin(
        spaPackageDefinitions,
        eq(spaPackageBalances.packageDefId, spaPackageDefinitions.id),
      )
      .where(and(...conditions))
      .orderBy(desc(spaPackageBalances.createdAt), desc(spaPackageBalances.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? sliced[sliced.length - 1]!.id : null;

    const items: CustomerPackageRow[] = sliced.map((r) => {
      const sessionsTotal = r.sessionsTotal ?? null;
      const sessionsUsed = r.sessionsUsed;
      const sessionsRemaining =
        sessionsTotal !== null ? sessionsTotal - sessionsUsed : null;

      const creditsTotal = r.creditsTotal ?? null;
      const creditsUsed = r.creditsUsed;
      const creditsRemaining =
        creditsTotal !== null
          ? Number(creditsTotal) - Number(creditsUsed)
          : null;

      return {
        id: r.id,
        customerId: r.customerId,
        packageDefId: r.packageDefId,
        packageName: r.packageName ?? null,
        packageType: r.packageType ?? null,
        purchaseDate: r.purchaseDate,
        expirationDate: r.expirationDate,
        sessionsTotal,
        sessionsUsed,
        sessionsRemaining,
        creditsTotal,
        creditsUsed,
        creditsRemaining,
        status: r.status,
        frozenAt: r.frozenAt ?? null,
        createdAt: r.createdAt,
      };
    });

    return { items, cursor: nextCursor, hasMore };
  });
}
