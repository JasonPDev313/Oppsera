import { eq } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { membershipAccountingSettings } from '@oppsera/db';

export interface MembershipAccountingSettingsResult {
  id: string;
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

export async function getMembershipSettings(
  tenantId: string,
): Promise<MembershipAccountingSettingsResult | null> {
  return withTenant(tenantId, async (tx) => {
    const [settings] = await (tx as any)
      .select()
      .from(membershipAccountingSettings)
      .where(eq(membershipAccountingSettings.tenantId, tenantId))
      .limit(1);

    if (!settings) return null;

    return {
      id: String(settings.id),
      clubModel: String(settings.clubModel ?? 'for_profit'),
      recognitionPolicy: (settings.recognitionPolicy as Record<string, unknown>) ?? null,
      defaultDuesRevenueAccountId: settings.defaultDuesRevenueAccountId
        ? String(settings.defaultDuesRevenueAccountId) : null,
      defaultDeferredRevenueAccountId: settings.defaultDeferredRevenueAccountId
        ? String(settings.defaultDeferredRevenueAccountId) : null,
      defaultInitiationRevenueAccountId: settings.defaultInitiationRevenueAccountId
        ? String(settings.defaultInitiationRevenueAccountId) : null,
      defaultNotesReceivableAccountId: settings.defaultNotesReceivableAccountId
        ? String(settings.defaultNotesReceivableAccountId) : null,
      defaultInterestIncomeAccountId: settings.defaultInterestIncomeAccountId
        ? String(settings.defaultInterestIncomeAccountId) : null,
      defaultCapitalContributionAccountId: settings.defaultCapitalContributionAccountId
        ? String(settings.defaultCapitalContributionAccountId) : null,
      defaultBadDebtAccountId: settings.defaultBadDebtAccountId
        ? String(settings.defaultBadDebtAccountId) : null,
      defaultLateFeeAccountId: settings.defaultLateFeeAccountId
        ? String(settings.defaultLateFeeAccountId) : null,
      defaultMinimumRevenueAccountId: settings.defaultMinimumRevenueAccountId
        ? String(settings.defaultMinimumRevenueAccountId) : null,
    };
  });
}
