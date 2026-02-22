import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { billingAccounts } from '@oppsera/db';

export interface GetFinancialAccountsSummaryInput {
  tenantId: string;
  customerId: string;
}

export interface FinancialAccountEntry {
  id: string;
  name: string;
  accountType: string;
  status: string;
  currentBalanceCents: number;
  creditLimitCents: number | null;
  creditUtilization: number; // 0-100%
  autopayStrategy: string | null;
  autopayEnabled: boolean;
  currency: string;
  collectionStatus: string;
}

export interface CustomerFinancialSummary {
  accounts: FinancialAccountEntry[];
  totalBalanceCents: number;
  totalCreditLimitCents: number;
  overallUtilization: number; // 0-100%
}

export async function getFinancialAccountsSummary(
  input: GetFinancialAccountsSummaryInput,
): Promise<CustomerFinancialSummary> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: billingAccounts.id,
        name: billingAccounts.name,
        accountType: billingAccounts.accountType,
        status: billingAccounts.status,
        currentBalanceCents: billingAccounts.currentBalanceCents,
        creditLimitCents: billingAccounts.creditLimitCents,
        autopayStrategy: billingAccounts.autopayStrategy,
        currency: billingAccounts.currency,
        collectionStatus: billingAccounts.collectionStatus,
      })
      .from(billingAccounts)
      .where(
        and(
          eq(billingAccounts.tenantId, input.tenantId),
          eq(billingAccounts.primaryCustomerId, input.customerId),
        ),
      );

    let totalBalanceCents = 0;
    let totalCreditLimitCents = 0;

    const accounts: FinancialAccountEntry[] = rows.map((row) => {
      const balance = Number(row.currentBalanceCents ?? 0);
      const limit = Number(row.creditLimitCents ?? 0);
      totalBalanceCents += balance;
      totalCreditLimitCents += limit;

      const utilization =
        limit > 0 ? Math.round((balance / limit) * 100) : 0;

      return {
        id: row.id,
        name: row.name,
        accountType: row.accountType,
        status: row.status,
        currentBalanceCents: balance,
        creditLimitCents: row.creditLimitCents ?? null,
        creditUtilization: utilization,
        autopayStrategy: row.autopayStrategy ?? null,
        autopayEnabled: row.autopayStrategy != null,
        currency: row.currency,
        collectionStatus: row.collectionStatus,
      };
    });

    const overallUtilization =
      totalCreditLimitCents > 0
        ? Math.round((totalBalanceCents / totalCreditLimitCents) * 100)
        : 0;

    return {
      accounts,
      totalBalanceCents,
      totalCreditLimitCents,
      overallUtilization,
    };
  });
}
