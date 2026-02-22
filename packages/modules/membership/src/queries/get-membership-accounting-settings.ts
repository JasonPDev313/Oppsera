import { eq } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { membershipAccountingSettings } from '@oppsera/db';

export interface GetMembershipAccountingSettingsInput {
  tenantId: string;
}

export interface MembershipAccountingSettingsData {
  clubModel: string;
  recognitionPolicy: Record<string, unknown> | null;
  defaultDuesRevenueAccountId: string | null;
  defaultDeferredRevenueAccountId: string | null;
  defaultInitiationRevenueAccountId: string | null;
  defaultNotesReceivableAccountId: string | null;
  defaultInterestIncomeAccountId: string | null;
  defaultCapitalContributionAccountId: string | null;
  defaultBadDebtAccountId: string | null;
  defaultLateFeeAccountId: string | null;
  defaultMinimumRevenueAccountId: string | null;
}

/**
 * Fetch membership accounting settings for a tenant.
 * Returns null if no settings row exists.
 */
export async function getMembershipAccountingSettings(
  input: GetMembershipAccountingSettingsInput,
): Promise<MembershipAccountingSettingsData | null> {
  return withTenant(input.tenantId, async (tx) => {
    const [row] = await (tx as any)
      .select()
      .from(membershipAccountingSettings)
      .where(eq(membershipAccountingSettings.tenantId, input.tenantId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      clubModel: String(row.clubModel ?? 'for_profit'),
      recognitionPolicy: (row.recognitionPolicy as Record<string, unknown>) ?? null,
      defaultDuesRevenueAccountId: row.defaultDuesRevenueAccountId
        ? String(row.defaultDuesRevenueAccountId)
        : null,
      defaultDeferredRevenueAccountId: row.defaultDeferredRevenueAccountId
        ? String(row.defaultDeferredRevenueAccountId)
        : null,
      defaultInitiationRevenueAccountId: row.defaultInitiationRevenueAccountId
        ? String(row.defaultInitiationRevenueAccountId)
        : null,
      defaultNotesReceivableAccountId: row.defaultNotesReceivableAccountId
        ? String(row.defaultNotesReceivableAccountId)
        : null,
      defaultInterestIncomeAccountId: row.defaultInterestIncomeAccountId
        ? String(row.defaultInterestIncomeAccountId)
        : null,
      defaultCapitalContributionAccountId: row.defaultCapitalContributionAccountId
        ? String(row.defaultCapitalContributionAccountId)
        : null,
      defaultBadDebtAccountId: row.defaultBadDebtAccountId
        ? String(row.defaultBadDebtAccountId)
        : null,
      defaultLateFeeAccountId: row.defaultLateFeeAccountId
        ? String(row.defaultLateFeeAccountId)
        : null,
      defaultMinimumRevenueAccountId: row.defaultMinimumRevenueAccountId
        ? String(row.defaultMinimumRevenueAccountId)
        : null,
    };
  });
}
