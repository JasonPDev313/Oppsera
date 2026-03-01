import { eq, and, desc } from 'drizzle-orm';
import {
  withTenant,
  spaPackageBalances,
  spaPackageDefinitions,
  spaPackageRedemptions,
  customers,
} from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export interface PackageRedemptionRow {
  id: string;
  appointmentId: string | null;
  sessionsRedeemed: number;
  creditsRedeemed: string;
  redeemedAt: Date;
  redeemedBy: string | null;
  voided: boolean;
}

export interface PackageBalanceDetail {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string | null;
  packageDefId: string;
  packageName: string | null;
  packageType: string | null;
  purchaseDate: string;
  expirationDate: string;
  sessionsTotal: number | null;
  sessionsUsed: number;
  creditsTotal: string | null;
  creditsUsed: string;
  status: string;
  frozenAt: Date | null;
  frozenUntil: Date | null;
  freezeCount: number;
  orderId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  redemptions: PackageRedemptionRow[];
}

/**
 * Returns a single package balance with full details.
 * LEFT JOINs spaPackageDefinitions for packageName and packageType.
 * LEFT JOINs customers for customerName.
 * Batch-fetches all redemptions for this balance.
 * Throws AppError('NOT_FOUND', ...) if not found.
 */
export async function getPackageBalance(
  tenantId: string,
  id: string,
): Promise<PackageBalanceDetail> {
  return withTenant(tenantId, async (tx) => {
    // Fetch balance with package definition + customer JOINs
    const [row] = await tx
      .select({
        id: spaPackageBalances.id,
        tenantId: spaPackageBalances.tenantId,
        customerId: spaPackageBalances.customerId,
        customerName: customers.displayName,
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
        frozenUntil: spaPackageBalances.frozenUntil,
        freezeCount: spaPackageBalances.freezeCount,
        orderId: spaPackageBalances.orderId,
        notes: spaPackageBalances.notes,
        createdAt: spaPackageBalances.createdAt,
        updatedAt: spaPackageBalances.updatedAt,
      })
      .from(spaPackageBalances)
      .leftJoin(
        spaPackageDefinitions,
        eq(spaPackageBalances.packageDefId, spaPackageDefinitions.id),
      )
      .leftJoin(
        customers,
        eq(spaPackageBalances.customerId, customers.id),
      )
      .where(
        and(
          eq(spaPackageBalances.id, id),
          eq(spaPackageBalances.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new AppError('NOT_FOUND', `Package balance ${id} not found`, 404);
    }

    // Batch-fetch all redemptions for this balance
    const redemptionRows = await tx
      .select({
        id: spaPackageRedemptions.id,
        appointmentId: spaPackageRedemptions.appointmentId,
        sessionsRedeemed: spaPackageRedemptions.sessionsRedeemed,
        creditsRedeemed: spaPackageRedemptions.creditsRedeemed,
        redeemedAt: spaPackageRedemptions.redeemedAt,
        redeemedBy: spaPackageRedemptions.redeemedBy,
        voided: spaPackageRedemptions.voided,
      })
      .from(spaPackageRedemptions)
      .where(
        and(
          eq(spaPackageRedemptions.balanceId, id),
          eq(spaPackageRedemptions.tenantId, tenantId),
        ),
      )
      .orderBy(desc(spaPackageRedemptions.redeemedAt));

    const redemptions: PackageRedemptionRow[] = redemptionRows.map((r) => ({
      id: r.id,
      appointmentId: r.appointmentId ?? null,
      sessionsRedeemed: r.sessionsRedeemed,
      creditsRedeemed: r.creditsRedeemed,
      redeemedAt: r.redeemedAt,
      redeemedBy: r.redeemedBy ?? null,
      voided: r.voided,
    }));

    return {
      id: row.id,
      tenantId: row.tenantId,
      customerId: row.customerId,
      customerName: row.customerName ?? null,
      packageDefId: row.packageDefId,
      packageName: row.packageName ?? null,
      packageType: row.packageType ?? null,
      purchaseDate: row.purchaseDate,
      expirationDate: row.expirationDate,
      sessionsTotal: row.sessionsTotal ?? null,
      sessionsUsed: row.sessionsUsed,
      creditsTotal: row.creditsTotal ?? null,
      creditsUsed: row.creditsUsed,
      status: row.status,
      frozenAt: row.frozenAt ?? null,
      frozenUntil: row.frozenUntil ?? null,
      freezeCount: row.freezeCount,
      orderId: row.orderId ?? null,
      notes: row.notes ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      redemptions,
    };
  });
}
