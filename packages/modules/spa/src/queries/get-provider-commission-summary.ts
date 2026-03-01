import { eq, and, gte, lte, sql } from 'drizzle-orm';
import {
  withTenant,
  spaCommissionLedger,
  spaProviders,
} from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export interface GetProviderCommissionSummaryInput {
  tenantId: string;
  providerId: string;
  startDate?: string; // YYYY-MM-DD filter on createdAt
  endDate?: string;   // YYYY-MM-DD filter on createdAt
}

export interface ProviderCommissionSummary {
  providerId: string;
  providerName: string;
  totalBaseAmountCents: number;
  totalCommissionCents: number;
  effectiveRate: number;
  calculatedCount: number;
  approvedCount: number;
  paidCount: number;
  pendingApprovalCents: number;
  pendingPaymentCents: number;
  totalPaidCents: number;
}

/**
 * Get aggregated commission summary for a specific provider.
 * Uses SQL CASE WHEN for status-specific counts and sums in a single query.
 * Optionally filters by date range on createdAt.
 * Throws NOT_FOUND if the provider does not exist for the tenant.
 */
export async function getProviderCommissionSummary(
  input: GetProviderCommissionSummaryInput,
): Promise<ProviderCommissionSummary> {
  return withTenant(input.tenantId, async (tx) => {
    // Verify provider exists
    const [provider] = await tx
      .select({
        id: spaProviders.id,
        displayName: spaProviders.displayName,
      })
      .from(spaProviders)
      .where(
        and(
          eq(spaProviders.tenantId, input.tenantId),
          eq(spaProviders.id, input.providerId),
        ),
      )
      .limit(1);

    if (!provider) {
      throw new AppError('NOT_FOUND', `Provider ${input.providerId} not found`, 404);
    }

    // Build conditions for the aggregation query
    const conditions: ReturnType<typeof eq>[] = [
      eq(spaCommissionLedger.tenantId, input.tenantId),
      eq(spaCommissionLedger.providerId, input.providerId),
    ];

    if (input.startDate) {
      conditions.push(gte(spaCommissionLedger.createdAt, new Date(input.startDate)));
    }

    if (input.endDate) {
      // End of day for the endDate
      const endOfDay = new Date(input.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(lte(spaCommissionLedger.createdAt, endOfDay));
    }

    const [agg] = await tx
      .select({
        totalBaseAmountCents: sql<number>`coalesce(sum(${spaCommissionLedger.baseAmountCents}), 0)::int`,
        totalCommissionCents: sql<number>`coalesce(sum(${spaCommissionLedger.commissionAmountCents}), 0)::int`,
        calculatedCount: sql<number>`count(*) filter (where ${spaCommissionLedger.status} = 'calculated')::int`,
        approvedCount: sql<number>`count(*) filter (where ${spaCommissionLedger.status} = 'approved')::int`,
        paidCount: sql<number>`count(*) filter (where ${spaCommissionLedger.status} = 'paid')::int`,
        pendingApprovalCents: sql<number>`coalesce(sum(${spaCommissionLedger.commissionAmountCents}) filter (where ${spaCommissionLedger.status} = 'calculated'), 0)::int`,
        pendingPaymentCents: sql<number>`coalesce(sum(${spaCommissionLedger.commissionAmountCents}) filter (where ${spaCommissionLedger.status} = 'approved'), 0)::int`,
        totalPaidCents: sql<number>`coalesce(sum(${spaCommissionLedger.commissionAmountCents}) filter (where ${spaCommissionLedger.status} = 'paid'), 0)::int`,
      })
      .from(spaCommissionLedger)
      .where(and(...conditions));

    const totalBase = Number(agg?.totalBaseAmountCents ?? 0);
    const totalCommission = Number(agg?.totalCommissionCents ?? 0);
    const effectiveRate = totalBase > 0
      ? Math.round((totalCommission / totalBase) * 10000) / 100
      : 0;

    return {
      providerId: provider.id,
      providerName: provider.displayName,
      totalBaseAmountCents: totalBase,
      totalCommissionCents: totalCommission,
      effectiveRate,
      calculatedCount: Number(agg?.calculatedCount ?? 0),
      approvedCount: Number(agg?.approvedCount ?? 0),
      paidCount: Number(agg?.paidCount ?? 0),
      pendingApprovalCents: Number(agg?.pendingApprovalCents ?? 0),
      pendingPaymentCents: Number(agg?.pendingPaymentCents ?? 0),
      totalPaidCents: Number(agg?.totalPaidCents ?? 0),
    };
  });
}
