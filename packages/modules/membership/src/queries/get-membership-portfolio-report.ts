import { eq, and, desc } from 'drizzle-orm';
import { withTenant, rmMembershipPortfolio } from '@oppsera/db';

export interface GetMembershipPortfolioReportInput {
  tenantId: string;
  asOfDate?: string;
}

export interface MembershipPortfolioData {
  id: string;
  asOfDate: string;
  totalAccounts: number;
  activeAccounts: number;
  suspendedAccounts: number;
  frozenAccounts: number;
  terminatedAccounts: number;
  totalArCents: number;
  totalDeferredRevenueCents: number;
  avgAccountAgeDays: number;
  newAccountsThisMonth: number;
  terminatedThisMonth: number;
  netMemberGrowth: number;
  totalDuesRevenueCents: number;
  totalInitiationRevenueCents: number;
  totalMinimumRevenueCents: number;
  totalLateFeeRevenueCents: number;
  autopayAdoptionPct: number;
  avgCollectionDays: number;
}

export async function getMembershipPortfolioReport(input: GetMembershipPortfolioReportInput): Promise<MembershipPortfolioData | null> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(rmMembershipPortfolio.tenantId, input.tenantId)];
    if (input.asOfDate) { conditions.push(eq(rmMembershipPortfolio.asOfDate, input.asOfDate)); }
    const rows = await (tx as any).select().from(rmMembershipPortfolio).where(and(...conditions)).orderBy(desc(rmMembershipPortfolio.asOfDate)).limit(1);
    const arr = Array.isArray(rows) ? rows : [];
    if (arr.length === 0) return null;
    const r = arr[0];
    return {
      id: String(r.id), asOfDate: String(r.asOfDate ?? ''),
      totalAccounts: Number(r.totalAccounts ?? 0), activeAccounts: Number(r.activeAccounts ?? 0),
      suspendedAccounts: Number(r.suspendedAccounts ?? 0), frozenAccounts: Number(r.frozenAccounts ?? 0),
      terminatedAccounts: Number(r.terminatedAccounts ?? 0), totalArCents: Number(r.totalArCents ?? 0),
      totalDeferredRevenueCents: Number(r.totalDeferredRevenueCents ?? 0),
      avgAccountAgeDays: Number(r.avgAccountAgeDays ?? 0),
      newAccountsThisMonth: Number(r.newAccountsThisMonth ?? 0),
      terminatedThisMonth: Number(r.terminatedThisMonth ?? 0),
      netMemberGrowth: Number(r.netMemberGrowth ?? 0),
      totalDuesRevenueCents: Number(r.totalDuesRevenueCents ?? 0),
      totalInitiationRevenueCents: Number(r.totalInitiationRevenueCents ?? 0),
      totalMinimumRevenueCents: Number(r.totalMinimumRevenueCents ?? 0),
      totalLateFeeRevenueCents: Number(r.totalLateFeeRevenueCents ?? 0),
      autopayAdoptionPct: Number(r.autopayAdoptionPct ?? 0),
      avgCollectionDays: Number(r.avgCollectionDays ?? 0),
    };
  });
}
