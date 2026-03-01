import { eq, and, sql } from 'drizzle-orm';
import { withTenant, spaPackageDefinitions, spaPackageBalances } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export interface PackageDefinitionDetail {
  id: string;
  name: string;
  description: string | null;
  packageType: string;
  includedServices: Array<{ serviceId: string; quantity: number }> | null;
  totalSessions: number | null;
  totalCredits: string | null;
  totalValueCents: number | null;
  sellingPriceCents: number;
  validityDays: number;
  isTransferable: boolean;
  isShareable: boolean;
  maxShares: number;
  autoRenew: boolean;
  renewalPriceCents: number | null;
  freezeAllowed: boolean;
  maxFreezeDays: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  activeBalanceCount: number;
}

/**
 * Returns a single package definition with full details.
 * Includes activeBalanceCount — count of spaPackageBalances where status = 'active'.
 * Throws AppError('NOT_FOUND', ...) if not found.
 */
export async function getPackageDefinition(
  tenantId: string,
  id: string,
): Promise<PackageDefinitionDetail> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        id: spaPackageDefinitions.id,
        name: spaPackageDefinitions.name,
        description: spaPackageDefinitions.description,
        packageType: spaPackageDefinitions.packageType,
        includedServices: spaPackageDefinitions.includedServices,
        totalSessions: spaPackageDefinitions.totalSessions,
        totalCredits: spaPackageDefinitions.totalCredits,
        totalValueCents: spaPackageDefinitions.totalValueCents,
        sellingPriceCents: spaPackageDefinitions.sellingPriceCents,
        validityDays: spaPackageDefinitions.validityDays,
        isTransferable: spaPackageDefinitions.isTransferable,
        isShareable: spaPackageDefinitions.isShareable,
        maxShares: spaPackageDefinitions.maxShares,
        autoRenew: spaPackageDefinitions.autoRenew,
        renewalPriceCents: spaPackageDefinitions.renewalPriceCents,
        freezeAllowed: spaPackageDefinitions.freezeAllowed,
        maxFreezeDays: spaPackageDefinitions.maxFreezeDays,
        isActive: spaPackageDefinitions.isActive,
        sortOrder: spaPackageDefinitions.sortOrder,
        createdAt: spaPackageDefinitions.createdAt,
        updatedAt: spaPackageDefinitions.updatedAt,
      })
      .from(spaPackageDefinitions)
      .where(
        and(
          eq(spaPackageDefinitions.id, id),
          eq(spaPackageDefinitions.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new AppError('NOT_FOUND', `Package definition ${id} not found`, 404);
    }

    // Count active balances for this package definition
    const [countRow] = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(spaPackageBalances)
      .where(
        and(
          eq(spaPackageBalances.packageDefId, id),
          eq(spaPackageBalances.tenantId, tenantId),
          eq(spaPackageBalances.status, 'active'),
        ),
      );

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      packageType: row.packageType,
      includedServices: (row.includedServices as Array<{ serviceId: string; quantity: number }>) ?? null,
      totalSessions: row.totalSessions ?? null,
      totalCredits: row.totalCredits ?? null,
      totalValueCents: row.totalValueCents ?? null,
      sellingPriceCents: row.sellingPriceCents,
      validityDays: row.validityDays,
      isTransferable: row.isTransferable,
      isShareable: row.isShareable,
      maxShares: row.maxShares,
      autoRenew: row.autoRenew,
      renewalPriceCents: row.renewalPriceCents ?? null,
      freezeAllowed: row.freezeAllowed,
      maxFreezeDays: row.maxFreezeDays ?? null,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      activeBalanceCount: countRow?.count ?? 0,
    };
  });
}
